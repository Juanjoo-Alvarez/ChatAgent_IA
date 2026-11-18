import { z } from "zod";
import { collectEvidence, isPromptAttack, safeOutput } from "./policy.js";
import type { EvidenceContext } from "./types.js";

const bookSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), title: z.string().min(1).max(500), authors: z.array(z.string()).max(30) });
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === "string" && safeOutput(value) && !isPromptAttack(value) ? value : "";
const texts = (value: unknown): string[] => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

export function updateContext(context: EvidenceContext, data: unknown): EvidenceContext {
  const record = object(data);
  const movies = collectEvidence(data).movies;
  const candidates = [record.book, ...(Array.isArray(record.results) ? record.results : [])];
  const books = candidates.flatMap((candidate) => {
    const parsed = bookSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  }).slice(0, 5);
  const changedMovie = movies.length > 0 && !movies.some((movie) => context.movies.some((previous) => previous.id === movie.id));
  return { movies: movies.length ? movies : context.movies, books: books.length ? books : changedMovie ? [] : context.books };
}

export const comparisonRequested = (content: string): boolean => /compar|adapt|basad[ao].*libro|tiene libro|fidelidad|con el libro/i.test(content.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
export const recommendationRequested = (content: string): boolean => /recomiend|recomenda|recomen|sugier|suger|que (?:pelicula|ver)|cual (?:pelicula|ver)/i.test(content.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
export const contextualComparison = (content: string): boolean => /comp[aá]ral[ao]|con el libro|esa pel[ií]cula|esta pel[ií]cula/i.test(content);

/** Solo se usan para recuperar candidatos cuando el modelo omite una llamada MCP. */
export function fallbackRecommendationCriteria(content: string): Record<string, unknown> {
  const normalized = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const genres: readonly [RegExp, number][] = [
    [/ciencia ficcion/, 878], [/\bdrama\b/, 18], [/\bcomedia\b/, 35],
    [/\bterror\b/, 27], [/\baccion\b/, 28], [/\banimacion\b/, 16],
    [/\bromance\b/, 10749], [/\baventura\b/, 12], [/\bfantasia\b/, 14]
  ];
  const selected = genres.filter(([pattern]) => pattern.test(normalized) && !new RegExp(`(?:sin|no quiero) ${pattern.source}`).test(normalized)).map(([, id]) => id);
  return selected.length ? { genres: selected, genre_match: "any" } : {};
}

/** Solo metadatos MCP seleccionan entidades; la prosa del modelo nunca crea IDs. */
export function selectContext(context: EvidenceContext, content: string): EvidenceContext {
  const normalized = content.toLocaleLowerCase("es");
  const movies = context.movies.filter((movie) => normalized.includes(movie.title.toLocaleLowerCase("es")) || new RegExp(`\\b${movie.id}\\b`).test(content));
  const books = context.books.filter((book) => normalized.includes(book.title.toLocaleLowerCase("es")) || content.split(/\s+/).includes(book.id));
  return { movies: movies.length === 1 ? movies : context.movies, books: books.length === 1 ? books : context.books };
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
    return [verified ? "La evidencia consultada identifica esta adaptación." : "No hay evidencia suficiente para confirmar esta adaptación.",
      ...texts(record.reasons), ...(verified ? [...claims(record.similarities), ...claims(record.differences), ...texts(object(record.recommendation).reasons)] : []),
      ...texts(record.limitations)].join(" ");
  }
  const evidence = updateContext({ movies: [], books: [] }, data);
  const movies = evidence.movies.map((movie) => `${text(movie.title) || "Película"} (TMDB ${movie.id}${movie.year === null ? "" : `, ${movie.year}`})`);
  const books = evidence.books.map((book) => `${text(book.title) || "Libro"} — ${book.authors.map(text).filter(Boolean).join(", ")} (Google Books ${book.id})`);
  if (movies.length) { return `${record.source === "fixture" ? "Resultados ficticios de integración (sin LLM)" : "Resultados de TMDB"}: ${movies.join("; ")}. Puedo compararlos con libros si lo deseas.`; }
  if (books.length) { return `Resultados de Google Books: ${books.join("; ")}. Una coincidencia de título no confirma una adaptación.`; }
  return "La consulta no devolvió resultados verificables. Puedes precisar el título o el autor; esto no demuestra que la obra o su adaptación no existan.";
}
