import type { Movie } from "@agichat/tmdb";
import type { z } from "zod";
import { bookSchema, comparisonSchema, preferencesSchema, type Book } from "./schemas.js";
import type { AdaptationEvidence } from "./AdaptationCatalog.js";

const source = "https://www.legendary.com/legendary-comics-announces-the-official-graphic-novel-adaptation-of-denis-villeneuves-epic-film-dune/";
const novelSource = "https://www.legendary.com/legendary-entertainment-acquires-rights-to-frank-herberts-classic-sci-fi-novel-dune/";
const publicationSource = "https://www.penguinrandomhouse.com/books/352036/dune-movie-tie-in-by-frank-herbert/9780143111580/";
const productionSource = "https://bfidatadigipres.github.io/previews/2021/10/05/dune/";

/** Catálogo revisado por el servidor, nunca suministrado como argumento por el modelo.
 * Nuevas adaptaciones requieren fuentes explícitas y revisión del registro.
 */
export const VERIFIED_ADAPTATIONS = [{
  movieId: 438631, movieYear: 2021, movieTitle: "Dune", author: "Frank Herbert", originalYear: 1965,
  bookTitles: ["Dune", "Dune (Movie Tie-In)", "Dune (Movie Tie-In)."],
  relationshipReason: "La fuente del productor identifica la novela y su autor; coinciden la película, el año, el título bibliográfico y el autor.",
  sources: [source, novelSource, publicationSource, productionSource],
  similarities: [{ text: "Ambas obras siguen a Paul Atreides y el conflicto en el planeta desértico Arrakis.", sources: [source, novelSource] }],
  differences: [{ text: "La adaptación de 2021 divide la novela en varias películas, por lo que esta entrega no abarca toda la obra. Las notas de producción documentan esa decisión de estructura.", sources: [productionSource] }]
}, {
  movieId: 70160, movieYear: 2012, movieTitle: "The Hunger Games", author: "Suzanne Collins", originalYear: 2008,
  bookTitles: ["The Hunger Games", "The Hunger Games: Movie Tie-In Edition", "Los juegos del hambre"],
  relationshipReason: "La editorial y la distribuidora identifican la película de 2012 como adaptación de la novela de Suzanne Collins; coinciden el título, el año de la película y la autora del libro.",
  sources: [
    "https://www.scholastic.com/newsroom/all-news/press-release/lionsgate--feasts-on-the-hunger-games.html",
    "https://www.scholastic.com/newsroom/all-news/press-release/lionsgate-joins-scribd--donorschoose-org--and-scholastic-for--th.html",
    "https://books.google.com/books/about/The_Hunger_Games.html?id=v7SzRTH5mwgC",
    "https://www.scholastic.com/content/dam/newsroom/press-kit/hunger-games/Suzanne%20Collins%20QA%20no%20contact.pdf"
  ],
  similarities: [{
    text: "La novela y su adaptación siguen a Katniss Everdeen en los Juegos de Panem.",
    sources: ["https://books.google.com/books/about/The_Hunger_Games.html?id=v7SzRTH5mwgC", "https://www.scholastic.com/newsroom/all-news/press-release/lionsgate-joins-scribd--donorschoose-org--and-scholastic-for--th.html"]
  }],
  differences: [{
    text: "Suzanne Collins explica que la película condensa la novela y debe dramatizar la vida interior de Katniss, narrada en primera persona en el libro.",
    sources: ["https://www.scholastic.com/content/dam/newsroom/press-kit/hunger-games/Suzanne%20Collins%20QA%20no%20contact.pdf"]
  }]
}] as const;
const canonical = (text: string): string => text.normalize("NFKC").trim().toLocaleLowerCase("en");

const bibliographicKey = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]/gu, "");
export function matchesAdaptation(book: Book, evidence: AdaptationEvidence): boolean {
  return book.title !== null && !book.provenance.suspected_instructions
    && !/graphic novel|novela gr[aá]fica|c[oó]mic|study guide|gu[ií]a de estudio|adapted by/i.test(`${book.title} ${book.description ?? ""}`)
    && evidence.titles.some((title) => bibliographicKey(title) === bibliographicKey(book.title!.replace(/\s*\((?:movie tie-in|film tie-in|.*edition)\)\.?$/i, "")))
    && evidence.authors.some((author) => book.authors.some((candidate) => bibliographicKey(candidate) === bibliographicKey(author)));
}

export function compareMovieBook(movie: Movie, rawBook: Book, rawPreferences: z.input<typeof preferencesSchema> = {}, associations: readonly AdaptationEvidence[] = []) {
  const book = bookSchema.parse(rawBook);
  const preferences = preferencesSchema.parse(rawPreferences);
  const title = canonical(book.title ?? "");
  const evidence = VERIFIED_ADAPTATIONS.find((record) => record.movieId === movie.id
    && record.movieYear === movie.year && canonical(movie.original_title ?? movie.title ?? "") === canonical(record.movieTitle)
    && record.bookTitles.some((value) => canonical(value) === title)
    && book.authors.some((author) => canonical(author) === canonical(record.author))
    && !/graphic novel|novela gr[aá]fica|c[oó]mic|adapted by/i.test(`${book.title ?? ""} ${book.description ?? ""}`)
    && !book.provenance.suspected_instructions);
  const association = associations.find((record) => record.movieId === movie.id && record.sources.length > 0
    && record.sources.every((url) => /^https:\/\/www\.wikidata\.org\/wiki\/Q[1-9]\d*$/.test(url)) && matchesAdaptation(book, record));
  const editionYear = /^(\d{4})(?:-|$)/.exec(book.published_date ?? "")?.[1];
  const originalYear = evidence?.originalYear ?? association?.originalYear;
  const dateConflict = originalYear !== undefined && editionYear !== undefined && Number(editionYear) < originalYear;
  const confirmed = (evidence !== undefined || association !== undefined) && !dateConflict;
  const titleMatch = title.length > 0 && [movie.title, movie.original_title].some((value) => value !== null && canonical(value) === title);
  const status = confirmed ? "adaptation_identified" : titleMatch ? "possible_match" : "insufficient_evidence";
  const reasons = confirmed
    ? [evidence?.relationshipReason ?? `Wikidata vincula esta película de TMDB con «${book.title}» de ${association!.authors.join(", ")}; el título y el autor coinciden con Google Books.`]
    : ["Los metadatos recuperados no bastan para confirmar una adaptación."];
  if (dateConflict) { reasons.push("La fecha bibliográfica contradice el año original documentado; verifica la edición."); }
  if (!confirmed && titleMatch) { reasons.push("El título coincide, pero esa coincidencia no prueba una adaptación."); }
  const limitations = [
    "La fecha de Google Books corresponde a la edición recuperada, no necesariamente a la publicación original.",
    "No se ha verificado fidelidad escena por escena ni capítulo por capítulo.",
    "Las fuentes consultadas pueden ser incompletas: ausencia de evidencia no significa ausencia de adaptación."
  ];
  if (book.description === null) { limitations.push("El libro no tiene descripción disponible."); }
  if (book.provenance.suspected_instructions || movie.provenance.suspected_instruction_fields.length > 0) {
    limitations.push("Se detectó texto potencialmente instructivo en los metadatos; se trata como datos, nunca como órdenes.");
  }
  let verdict: "consider" | "not_recommended" | "undetermined" = "undetermined";
  const recommendationReasons: string[] = [];
  if (confirmed) {
    const matches = preferences.genres.filter((genre) => movie.genres.some((item) => canonical(item) === canonical(genre)));
    const failsRating = preferences.min_rating !== undefined && movie.rating !== null && movie.rating < preferences.min_rating;
    if (failsRating) {
      verdict = "not_recommended";
      recommendationReasons.push("La valoración de TMDB está por debajo del mínimo solicitado; no mide fidelidad al libro.");
    } else if (preferences.requires_fidelity) {
      recommendationReasons.push("No hay evidencia suficiente para recomendarla por fidelidad al libro.");
    } else if (preferences.min_rating !== undefined && movie.rating === null) {
      recommendationReasons.push("No hay valoración disponible para comprobar el mínimo solicitado.");
    } else if (preferences.genres.length > 0 && matches.length === 0) {
      recommendationReasons.push("Los géneros recuperados no permiten justificar una coincidencia con tus preferencias.");
    } else {
      verdict = "consider";
      recommendationReasons.push("Puedes considerar verla como interpretación cinematográfica de la obra identificada.");
      if (matches.length > 0) { recommendationReasons.push(`Coincide con estos géneros solicitados: ${matches.join(", ")}.`); }
    }
  } else { recommendationReasons.push("Confirma primero la adaptación; no es posible evaluar su relación con este libro."); }
  return comparisonSchema.parse({
    status, reasons, similarities: confirmed ? evidence?.similarities ?? [] : [],
    differences: confirmed ? evidence?.differences ?? [{ text: `Puedes contrastar la sinopsis de la película con la descripción bibliográfica de «${book.title}». La asociación confirma la obra de origen; no demuestra qué escenas se cambiaron.`, sources: [...association!.sources] }] : [],
    recommendation: { verdict, reasons: recommendationReasons }, limitations,
    ...(association !== undefined && evidence === undefined && confirmed ? { synopses: { movie: movie.overview, book: book.description } } : {}),
    sources: [...new Set([book.url, movie.tmdb_url, ...(confirmed ? evidence?.sources ?? association!.sources : [])])],
    references: [book.reference], book, movie_id: movie.id,
    movie: { id: movie.id, title: movie.title, year: movie.year, poster: movie.poster, imdb_id: movie.imdb_id }
  });
}
