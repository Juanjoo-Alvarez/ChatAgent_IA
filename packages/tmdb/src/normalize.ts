import type {
  FieldStatus,
  Movie,
  MovieField,
  MovieReference
} from "./types";

export const TMDB_WEB_BASE_URL = "https://www.themoviedb.org";
export const IMDB_WEB_BASE_URL = "https://www.imdb.com";

const IMDB_ID_PATTERN = /^tt\d{7,10}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const UNTRUSTED_FIELDS: readonly MovieField[] = [
  "title",
  "original_title",
  "overview",
  "genres"
];

/** Origen del identificador IMDb según la operación que produjo el registro. */
export type ImdbLookup =
  | { readonly kind: "not_requested" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "value"; readonly value: unknown };

export interface NormalizeContext {
  readonly imageBaseUrl: string;
  readonly posterSize: string;
  /** `null` cuando no se pudo obtener el catálogo de géneros. */
  readonly genresById: ReadonlyMap<number, string> | null;
  readonly imdb: ImdbLookup;
}

interface FieldRead<T> {
  readonly status: FieldStatus;
  readonly value: T | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function read<T>(status: FieldStatus, value: T | null = null): FieldRead<T> {
  return { status, value };
}

function readText(value: unknown): FieldRead<string> {
  if (value === undefined || value === null) {
    return read("missing");
  }
  if (typeof value !== "string") {
    return read("invalid");
  }
  const trimmed = value.trim();
  return trimmed === "" ? read("empty") : read("present", trimmed);
}

function readReleaseDate(value: unknown): FieldRead<string> & { readonly year: number | null } {
  const text = readText(value);
  if (text.value === null) {
    return { ...text, year: null };
  }

  const match = DATE_PATTERN.exec(text.value);
  if (match === null) {
    return { status: "invalid", value: null, year: null };
  }

  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isRealDate
    ? { status: "present", value: text.value, year }
    : { status: "invalid", value: null, year: null };
}

function readVoteCount(value: unknown): FieldRead<number> {
  if (value === undefined || value === null) {
    return read("missing");
  }
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? read("present", value as number)
    : read("invalid");
}

function readRating(value: unknown, voteCount: FieldRead<number>): FieldRead<number> {
  if (value === undefined || value === null) {
    return read("missing");
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    return read("invalid");
  }
  // TMDB devuelve 0 cuando nadie ha votado; eso no es una valoración real.
  if (voteCount.value === 0 || (value === 0 && voteCount.value === null)) {
    return read("empty");
  }
  return read("present", value);
}

function readGenres(
  record: Record<string, unknown>,
  genresById: ReadonlyMap<number, string> | null
): FieldRead<readonly string[]> {
  const { genres, genre_ids: genreIds } = record;

  // Los detalles traen objetos `{ id, name }`; los listados traen solo IDs.
  if (Array.isArray(genres)) {
    if (genres.length === 0) {
      return read("empty", []);
    }
    const names = genres.flatMap((genre) =>
      isRecord(genre) && typeof genre.name === "string" && genre.name.trim() !== ""
        ? [genre.name.trim()]
        : []
    );
    return names.length > 0 ? read("present", names) : read("invalid", []);
  }

  if (Array.isArray(genreIds)) {
    if (genreIds.length === 0) {
      return read("empty", []);
    }
    if (genresById === null) {
      return read("unavailable", []);
    }
    const names = genreIds.flatMap((id) => {
      const name = typeof id === "number" ? genresById.get(id) : undefined;
      return name === undefined ? [] : [name];
    });
    return names.length > 0 ? read("present", names) : read("unavailable", []);
  }

  if (genres === undefined && genreIds === undefined) {
    return read("missing", []);
  }
  return read(genres === null || genreIds === null ? "missing" : "invalid", []);
}

function readPoster(value: unknown, context: NormalizeContext): FieldRead<string> {
  const path = readText(value);
  if (path.value === null) {
    return path;
  }
  if (!path.value.startsWith("/") || /\s/.test(path.value)) {
    return read("invalid");
  }
  return read("present", `${context.imageBaseUrl}/${context.posterSize}${path.value}`);
}

/** Valida un identificador IMDb sin inventarlo ni corregirlo. */
export function readImdbId(value: unknown): FieldRead<string> {
  const text = readText(value);
  if (text.value === null) {
    return text;
  }
  return IMDB_ID_PATTERN.test(text.value) ? text : read("invalid");
}

function readImdb(lookup: ImdbLookup): FieldRead<string> {
  if (lookup.kind === "value") {
    return readImdbId(lookup.value);
  }
  return read(lookup.kind);
}

export function tmdbMovieUrl(id: number): string {
  return `${TMDB_WEB_BASE_URL}/movie/${id}`;
}

export function imdbTitleUrl(imdbId: string): string {
  return `${IMDB_WEB_BASE_URL}/title/${imdbId}/`;
}

export function buildMovieReference(id: number, imdbId: string | null): MovieReference {
  return imdbId === null
    ? { kind: "tmdb", id: String(id), url: tmdbMovieUrl(id) }
    : { kind: "imdb", id: imdbId, url: imdbTitleUrl(imdbId) };
}

export function hasValidTmdbId(record: Record<string, unknown>): boolean {
  return Number.isSafeInteger(record.id) && (record.id as number) > 0;
}

/**
 * Convierte un registro de TMDB al contrato `Movie`. Devuelve `null` solo si
 * falta un identificador de TMDB válido, porque sin él no hay referencia posible.
 */
export function normalizeMovie(raw: unknown, context: NormalizeContext): Movie | null {
  if (!isRecord(raw) || !hasValidTmdbId(raw)) {
    return null;
  }

  const id = raw.id as number;
  const title = readText(raw.title);
  const originalTitle = readText(raw.original_title);
  const releaseDate = readReleaseDate(raw.release_date);
  const overview = readText(raw.overview);
  const genres = readGenres(raw, context.genresById);
  const voteCount = readVoteCount(raw.vote_count);
  const rating = readRating(raw.vote_average, voteCount);
  const poster = readPoster(raw.poster_path, context);
  const imdb = readImdb(context.imdb);

  return {
    id,
    title: title.value,
    original_title: originalTitle.value,
    year: releaseDate.year,
    release_date: releaseDate.value,
    overview: overview.value,
    genres: genres.value ?? [],
    rating: rating.value,
    vote_count: voteCount.value,
    poster: poster.value,
    imdb_id: imdb.value,
    reference: buildMovieReference(id, imdb.value),
    tmdb_url: tmdbMovieUrl(id),
    field_status: {
      title: title.status,
      original_title: originalTitle.status,
      release_date: releaseDate.status,
      overview: overview.status,
      genres: genres.status,
      rating: rating.status,
      vote_count: voteCount.status,
      poster: poster.status,
      imdb_id: imdb.status
    },
    provenance: {
      source: "tmdb",
      trust: "untrusted_external",
      untrusted_fields: UNTRUSTED_FIELDS
    }
  };
}

/** Clave de comparación insensible a mayúsculas, tildes y espacios extremos. */
export function comparisonKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
