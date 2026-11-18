import { z } from "zod";
import { collectEvidence, isPromptAttack, safeOutput } from "./policy.js";
import type { EvidenceContext, RecommendationCandidate } from "./types.js";

const bookSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), title: z.string().min(1).max(500), authors: z.array(z.string()).max(30) });
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === "string" && safeOutput(value) && !isPromptAttack(value) ? value : "";
const texts = (value: unknown): string[] => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
export const normalize = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();

export function updateContext(context: EvidenceContext, data: unknown): EvidenceContext {
  const record = object(data);
  const movies = collectEvidence(data).movies;
  const candidates = [record.book, ...(Array.isArray(record.results) ? record.results : [])];
  const books = candidates.flatMap((candidate) => {
    const parsed = bookSchema.safeParse(candidate);
    return parsed.success && text(parsed.data.title) ? [parsed.data] : [];
  }).slice(0, 5);
  const changedMovie = movies.length > 0 && !movies.some((movie) => context.movies.some((previous) => previous.id === movie.id));
  const { recommendation, comparisonStatus, ...previous } = context;
  return { ...previous, movies: movies.length ? movies : context.movies, books: books.length ? books : changedMovie ? [] : context.books,
    ...(!changedMovie && recommendation !== undefined ? { recommendation } : {}),
    ...(!changedMovie && comparisonStatus !== undefined ? { comparisonStatus } : {}) };
}

export const comparisonRequested = (content: string): boolean => /compar|adapt|(?:basad|inspirad)[ao].*libro|tiene (?:un )?libro|fidelidad|con el libro|\by el libro/i.test(normalize(content));
export const recommendationRequested = (content: string): boolean => /recomiend|recomenda|recomen|sugier|suger|que (?:pelicula|ver)|cual (?:pelicula|ver)/i.test(normalize(content));
export const contextualComparison = (content: string): boolean => /comp[aá]ral[ao]|con el libro|esa pel[ií]cula|esta pel[ií]cula/i.test(content);
export const selectedMovieComparison = (content: string): boolean =>
  /^[¿¡]?(?:comp[áa]ral[ao](?: con (?:el|su) libro)?|y el libro|(?:esa |esta )?tiene (?:un )?libro|(?:est[aá] |esa pel[ií]cula |esta pel[ií]cula )?(?:basad[ao]|inspirad[ao]) en (?:alg[uú]n|un|el) libro)[.!?]*$/i.test(content.trim());

export function fallbackRecommendationCriteria(content: string): Record<string, unknown> {
  const normalized = normalize(content);
  const genres: readonly [RegExp, number][] = [
    [/ciencia ficcion/, 878], [/\bdrama\b/, 18], [/\bcomedia\b/, 35],
    [/\bterror\b/, 27], [/\baccion\b/, 28], [/\banimacion\b/, 16],
    [/\bromance\b/, 10749], [/\baventuras?\b/, 12], [/\bfantasia\b/, 14], [/\b(?:suspenso|thriller)\b/, 53],
    [/\bmisterio\b/, 9648], [/\b(?:belica|guerra)\b/, 10752], [/\bdocumental\b/, 99]
  ];
  const selected = genres.filter(([pattern]) => pattern.test(normalized) && !new RegExp(`(?:sin|no quiero) ${pattern.source}`).test(normalized)).map(([, id]) => id);
  const criteria: Record<string, unknown> = selected.length ? { genres: selected, genre_match: "any" } : {};
  const range = /\b(?:entre|de|desde)\s+(18\d{2}|19\d{2}|20\d{2})\s+(?:y|a|hasta)\s+(18\d{2}|19\d{2}|20\d{2})\b/.exec(normalized);
  const decades: Record<string, number> = { cincuenta: 1950, sesenta: 1960, setenta: 1970, ochenta: 1980, noventa: 1990 };
  const decade = /\banos\s+(cincuenta|sesenta|setenta|ochenta|noventa|19\d0|20\d0|[5-9]0)\b/.exec(normalized)?.[1];
  if (range !== null && Number(range[1]) <= Number(range[2])) {
    criteria.year_from = Number(range[1]); criteria.year_to = Number(range[2]);
  } else if (decade !== undefined) {
    const start = decades[decade] ?? (decade.length === 2 ? 1900 + Number(decade) : Number(decade));
    criteria.year_from = start; criteria.year_to = start + 9;
  } else {
    const year = /\b(?:de|del|ano)\s+(18\d{2}|19\d{2}|20\d{2})\b/.exec(normalized)?.[1];
    if (year !== undefined) { criteria.year = Number(year); }
  }
  const rating = /\b(?:valoracion|puntuacion|nota)(?:\s+minima)?(?:\s+de)?\s*:?\s*(10|[0-9](?:[.,]\d+)?)\b/.exec(normalized)?.[1];
  if (rating !== undefined) { criteria.min_rating = Number(rating.replace(",", ".")); }
  const votes = /\b(?:al menos|minimo(?: de)?|mas de)\s+(\d{1,7})\s+votos\b/.exec(normalized);
  if (votes !== null) { criteria.min_vote_count = Number(votes[1]) + (votes[0].startsWith("mas de") ? 1 : 0); }
  return criteria;
}

export function simpleGenreRequest(content: string): boolean {
  return /^(?:(?:recomiendame|recomienda|sugiereme|sugiere|me gusta|prefiero) (?:una pelicula |una |el |la )?(?:de )?)?(?:accion|drama|comedia|terror|ciencia ficcion|animacion|romance|aventuras?|fantasia|suspenso|thriller|misterio|guerra|documental)[.!?]*$/.test(normalize(content));
}

export function recommendationFollowUp(content: string): "another" | "recent" | "reason" | undefined {
  const request = normalize(content).replace(/[¿?¡!.]/g, "");
  if (/^(?:y )?(?:(?:dame|recomiendame|sugiereme) )?otr[ao](?: pelicula| opcion)?(?: por favor)?$/.test(request)) { return "another"; }
  if (/^(?:y )?(?:(?:dame|recomiendame|sugiereme) )?(?:una|otra|algo) mas reciente(?: por favor)?$/.test(request)) { return "recent"; }
  if (/^por que(?: esa| esta| esa pelicula| la recomiendas)?$/.test(request)) { return "reason"; }
  return undefined;
}

export function recommendationCandidates(data: unknown, excluded: readonly number[], newerThan?: { year: number | null; date: string | null }) {
  const candidates = object(data).candidates;
  if (!Array.isArray(candidates)) { return []; }
  return candidates.flatMap((candidate: unknown) => {
    const entry = object(candidate);
    const movie = collectEvidence({ movie: entry }).movies[0];
    if (movie === undefined || !text(movie.title) || excluded.includes(movie.id)) { return []; }
    const releaseDate = typeof entry.release_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.release_date) ? entry.release_date : null;
    if (newerThan !== undefined && newerThan.year !== null) {
      const newer = newerThan.date !== null && releaseDate !== null
        ? releaseDate > newerThan.date : movie.year !== null && movie.year > newerThan.year;
      if (!newer) { return []; }
    }
    const saved: RecommendationCandidate = {
      id: movie.id, title: movie.title, year: movie.year, poster: movie.poster, imdb_id: movie.imdbId, release_date: releaseDate,
      original_title: originalTitle(entry, movie.title), overview: text(entry.overview).slice(0, 500),
      genres: texts(entry.genres).slice(0, 2).map((genre) => genre.slice(0, 80)),
      rating: typeof entry.rating === "number" ? entry.rating : null,
      vote_count: typeof entry.vote_count === "number" ? entry.vote_count : null
    };
    return [{ entry: saved, movie }];
  }).sort((a, b) => Number(b.movie.poster !== null) - Number(a.movie.poster !== null));
}

export function recommendationReason(entry: RecommendationCandidate): string {
  const genres = texts(entry.genres).slice(0, 2);
  const genre = genres.length ? `TMDB la clasifica como ${genres.join(" y ")}.` : "Coincide con los criterios de la búsqueda en TMDB.";
  const overview = text(entry.overview).slice(0, 500);
  return overview ? `${genre} ${overview}` : genre;
}

export function originalTitle(entry: Record<string, unknown>, title: string): string {
  return text(entry.original_title).slice(0, 300) || title;
}

/** Solo metadatos MCP seleccionan entidades; la prosa del modelo nunca crea IDs. */
export function selectContext(context: EvidenceContext, content: string): EvidenceContext {
  const normalized = content.toLocaleLowerCase("es");
  const movies = context.movies.filter((movie) => normalized.includes(movie.title.toLocaleLowerCase("es")) || new RegExp(`\\b${movie.id}\\b`).test(content));
  const books = context.books.filter((book) => normalized.includes(book.title.toLocaleLowerCase("es")) || content.split(/\s+/).includes(book.id));
  return { ...context, movies: movies.length === 1 ? movies : context.movies, books: books.length === 1 ? books : context.books };
}

/** La respuesta factual se construye desde MCP, no desde afirmaciones libres del LLM. */
export function groundedText(name: string, data: unknown, recommendation = true): string {
  const record = object(data);
  if (name === "recommend_movies" && recommendation) {
    const candidates = Array.isArray(record.candidates) ? record.candidates : [];
    const movies = candidates.flatMap((candidate) => {
      const entry = object(candidate);
      const title = text(entry.title);
      return Number.isSafeInteger(entry.id) && title ? [{ title, year: entry.year, rating: entry.rating, votes: entry.vote_count, genres: texts(entry.genres) }] : [];
    }).slice(0, 3);
    if (movies.length === 0) { return "No encontré candidatos verificables con esos criterios. Prueba otro género o amplía tus preferencias."; }
    const first = movies[0]!;
    const title = `${first.title}${Number.isSafeInteger(first.year) ? ` (${first.year})` : ""}`;
    const genre = first.genres.length ? ` TMDB la clasifica como ${first.genres.slice(0, 2).join(" y ")}.` : "";
    const rating = typeof first.rating === "number" && first.rating >= 0 && first.rating <= 10 && Number.isSafeInteger(first.votes) && (first.votes as number) > 0
      ? ` Tiene ${first.rating}/10 en TMDB con ${first.votes} votos.` : "";
    const alternatives = movies.slice(1).map((movie) => `${movie.title}${Number.isSafeInteger(movie.year) ? ` (${movie.year})` : ""}`);
    return `${record.source === "fixture" ? "En modo de prueba (sin LLM), te recomiendo" : "Te recomiendo"} ${title}.${genre}${rating}${alternatives.length ? ` Otras opciones: ${alternatives.join("; ")}.` : ""} Puedo compararla con su libro si existe.`;
  }
  if (name === "compare_movie_book") {
    const verified = record.status === "adaptation_identified"
      && Array.isArray(record.sources) && record.sources.some((source) => typeof source === "string" && /^https:\/\//.test(source));
    const claims = (value: unknown): string[] => Array.isArray(value) ? value.flatMap((claim) => {
      const entry = object(claim);
      return Array.isArray(entry.sources) && entry.sources.length > 0 ? [text(entry.text)].filter(Boolean) : [];
    }) : [];
    const synopses = object(record.synopses);
    const excerpt = (value: unknown): string => text(typeof value === "string" ? value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ") : value).slice(0, 350);
    const movieSynopsis = excerpt(synopses.movie), bookSynopsis = excerpt(synopses.book);
    return [verified ? "La evidencia consultada identifica esta adaptación." : "No hay evidencia suficiente para confirmar esta adaptación.",
      ...texts(record.reasons), ...(verified ? [...claims(record.similarities), ...claims(record.differences), ...texts(object(record.recommendation).reasons)] : []),
      ...(verified && movieSynopsis ? [`Sinopsis de TMDB: ${movieSynopsis}`] : []),
      ...(verified && bookSynopsis ? [`Descripción de Google Books: ${bookSynopsis}`] : []),
      ...texts(record.limitations).slice(0, 2)].join(" ");
  }
  const evidence = updateContext({ movies: [], books: [] }, data);
  const movies = evidence.movies.map((movie) => `${text(movie.title) || "Película"} (TMDB ${movie.id}${movie.year === null ? "" : `, ${movie.year}`})`);
  const books = evidence.books.map((book) => `${text(book.title) || "Libro"} — ${book.authors.map(text).filter(Boolean).join(", ")} (Google Books ${book.id})`);
  if (movies.length) { return `${record.source === "fixture" ? "Resultados ficticios de integración (sin LLM)" : "Resultados de TMDB"}: ${movies.join("; ")}. Puedo compararlos con libros si lo deseas.`; }
  if (books.length) { return `Resultados de Google Books: ${books.join("; ")}. Una coincidencia de título no confirma una adaptación.`; }
  return "La consulta no devolvió resultados verificables. Puedes precisar el título o el autor; esto no demuestra que la obra o su adaptación no existan.";
}
