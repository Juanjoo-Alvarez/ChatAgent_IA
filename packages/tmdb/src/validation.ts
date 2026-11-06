import { TmdbError } from "./errors.js";
import { SORT_OPTIONS, type SortOption } from "./types.js";

// TMDB no entrega páginas posteriores a la 500 en búsqueda ni descubrimiento.
export const MAX_PAGE = 500;
export const MIN_YEAR = 1870;
export const MAX_YEAR = 2100;
export const MAX_QUERY_LENGTH = 200;
export const MAX_GENRES = 20;

function invalid(message: string, details?: Record<string, unknown>): TmdbError {
  return new TmdbError({ code: "invalid_request", message, details });
}

export function assertQuery(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid("query must be a non-empty string");
  }
  const query = value.trim();
  if (query.length > MAX_QUERY_LENGTH) {
    throw invalid(`query must have at most ${MAX_QUERY_LENGTH} characters`);
  }
  return query;
}

export function assertPage(value: number | undefined): number {
  if (value === undefined) {
    return 1;
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE) {
    throw invalid(`page must be an integer between 1 and ${MAX_PAGE}`);
  }
  return value;
}

export function assertYear(value: number | undefined, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < MIN_YEAR || value > MAX_YEAR) {
    throw invalid(`${field} must be an integer between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  return value;
}

export function assertMovieId(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw invalid("movie_id must be a positive integer");
  }
  return value as number;
}

export function assertMinRating(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    throw invalid("min_rating must be a number between 0 and 10");
  }
  return value;
}

export function assertMinVoteCount(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalid("min_vote_count must be a non-negative integer");
  }
  return value;
}

export function assertSortBy(value: string | undefined): SortOption | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!(SORT_OPTIONS as readonly string[]).includes(value)) {
    throw invalid("sort_by is not supported", { allowed: SORT_OPTIONS });
  }
  return value as SortOption;
}

export function assertLanguageCode(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^[a-z]{2}$/.test(value)) {
    throw invalid("original_language must be an ISO 639-1 code such as 'es'");
  }
  return value;
}

export interface YearCriteria {
  readonly year: number | undefined;
  readonly yearFrom: number | undefined;
  readonly yearTo: number | undefined;
}

export function assertYearCriteria(
  year: number | undefined,
  yearFrom: number | undefined,
  yearTo: number | undefined
): YearCriteria {
  const criteria = {
    year: assertYear(year, "year"),
    yearFrom: assertYear(yearFrom, "year_from"),
    yearTo: assertYear(yearTo, "year_to")
  };

  if (criteria.year !== undefined && (criteria.yearFrom !== undefined || criteria.yearTo !== undefined)) {
    throw invalid("year cannot be combined with year_from or year_to");
  }
  if (
    criteria.yearFrom !== undefined &&
    criteria.yearTo !== undefined &&
    criteria.yearFrom > criteria.yearTo
  ) {
    throw invalid("year_from must be less than or equal to year_to");
  }
  return criteria;
}

export function assertGenreCount(count: number): void {
  if (count > MAX_GENRES) {
    throw invalid(`genres must contain at most ${MAX_GENRES} items`);
  }
}
