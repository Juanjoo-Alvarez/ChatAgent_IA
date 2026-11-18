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

export const comparisonRequested = (content: string): boolean => /compar|adaptacion|basad[ao].*libro|tiene libro|fidelidad|con el libro/i.test(content.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
export const contextualComparison = (content: string): boolean => /comp[aá]ral[ao]|con el libro|esa pel[ií]cula|esta pel[ií]cula/i.test(content);

/** Solo metadatos MCP seleccionan entidades; la prosa del modelo nunca crea IDs. */
export function selectContext(context: EvidenceContext, content: string): EvidenceContext {
  const normalized = content.toLocaleLowerCase("es");
  const movies = context.movies.filter((movie) => normalized.includes(movie.title.toLocaleLowerCase("es")) || new RegExp(`\\b${movie.id}\\b`).test(content));
  const books = context.books.filter((book) => normalized.includes(book.title.toLocaleLowerCase("es")) || content.split(/\s+/).includes(book.id));
  return { movies: movies.length === 1 ? movies : context.movies, books: books.length === 1 ? books : context.books };
}

/** La respuesta factual se construye desde MCP, no desde afirmaciones libres del LLM. */
export function groundedText(name: string, data: unknown): string {
  const record = object(data);
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
