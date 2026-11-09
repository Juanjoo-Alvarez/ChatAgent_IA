import type { Movie } from "@agichat/tmdb";
import type { z } from "zod";
import { bookSchema, comparisonSchema, preferencesSchema, type Book } from "./schemas.js";

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
  sources: [source, novelSource, publicationSource, productionSource],
  similarities: [{ text: "Ambas obras siguen a Paul Atreides y el conflicto en el planeta desértico Arrakis.", sources: [source, novelSource] }],
  differences: [{ text: "La adaptación de 2021 divide la novela en varias películas, por lo que esta entrega no abarca toda la obra. Las notas de producción documentan esa decisión de estructura.", sources: [productionSource] }]
}] as const;
const canonical = (text: string): string => text.normalize("NFKC").trim().toLocaleLowerCase("en");

export function compareMovieBook(movie: Movie, rawBook: Book, rawPreferences: z.input<typeof preferencesSchema> = {}) {
  const book = bookSchema.parse(rawBook);
  const preferences = preferencesSchema.parse(rawPreferences);
  const title = canonical(book.title ?? "");
  const evidence = VERIFIED_ADAPTATIONS.find((record) => record.movieId === movie.id
    && record.movieYear === movie.year && canonical(movie.original_title ?? movie.title ?? "") === canonical(record.movieTitle)
    && record.bookTitles.some((value) => canonical(value) === title)
    && book.authors.length === 1 && canonical(book.authors[0] ?? "") === canonical(record.author)
    && !book.provenance.suspected_instructions);
  const editionYear = /^(\d{4})(?:-|$)/.exec(book.published_date ?? "")?.[1];
  const dateConflict = evidence !== undefined && editionYear !== undefined && Number(editionYear) < evidence.originalYear;
  const confirmed = evidence !== undefined && !dateConflict;
  const titleMatch = title.length > 0 && [movie.title, movie.original_title].some((value) => value !== null && canonical(value) === title);
  const status = confirmed ? "adaptation_identified" : titleMatch ? "possible_match" : "insufficient_evidence";
  const reasons = confirmed
    ? ["La fuente del productor identifica la novela y su autor; coinciden la película, el año, el título bibliográfico y el autor."]
    : ["Los metadatos recuperados no bastan para confirmar una adaptación."];
  if (dateConflict) { reasons.push("La fecha bibliográfica contradice el año original documentado; verifica la edición."); }
  if (!confirmed && titleMatch) { reasons.push("El título coincide, pero esa coincidencia no prueba una adaptación."); }
  const limitations = [
    "La fecha de Google Books corresponde a la edición recuperada, no necesariamente a la publicación original.",
    "No se ha verificado fidelidad escena por escena ni capítulo por capítulo.",
    "El catálogo de asociaciones verificadas es limitado: ausencia de evidencia no significa ausencia de adaptación."
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
    status, reasons, similarities: confirmed ? evidence.similarities : [],
    differences: confirmed ? evidence.differences : [],
    recommendation: { verdict, reasons: recommendationReasons }, limitations,
    sources: [...new Set([book.url, movie.tmdb_url, ...(confirmed ? evidence.sources : [])])],
    references: [book.reference], book, movie_id: movie.id
  });
}
