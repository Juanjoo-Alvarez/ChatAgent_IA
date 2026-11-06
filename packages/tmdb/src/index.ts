// API pública de la integración con TMDB.
export type { FetchLike } from "@agichat/external-api";
export {
  CANDIDATES_DISCLAIMER,
  DEFAULT_LANGUAGE,
  DEFAULT_TMDB_CACHE_TTL_MS,
  DEFAULT_MIN_VOTES_WITH_RATING,
  DEFAULT_POSTER_SIZE,
  DEFAULT_TIMEOUT_MS,
  TMDB_API_BASE_URL,
  TMDB_CACHE_NAMESPACE,
  TMDB_IMAGE_BASE_URL,
  TMDB_QUOTA_PROVIDER,
  TmdbClient,
  type TmdbCacheOptions,
  type TmdbCacheTtl,
  type TmdbClientOptions
} from "./TmdbClient";
export {
  TmdbError,
  parseRetryAfter,
  type TmdbErrorCode,
  type TmdbErrorOptions
} from "./errors";
export {
  IMDB_WEB_BASE_URL,
  TMDB_WEB_BASE_URL,
  buildMovieReference,
  imdbTitleUrl,
  normalizeMovie,
  tmdbMovieUrl,
  type ImdbLookup,
  type NormalizeContext
} from "./normalize";
export {
  SORT_OPTIONS,
  type AppliedFilters,
  type CandidateCriteria,
  type CandidateResult,
  type DiscoverMoviesParams,
  type ExternalIdsResult,
  type FieldStatus,
  type Genre,
  type GenreInput,
  type GenreMatch,
  type Movie,
  type MovieField,
  type MoviePage,
  type MovieProvenance,
  type MovieReference,
  type MovieSearchResult,
  type SearchMoviesParams,
  type SortOption
} from "./types";
export { MAX_PAGE, MAX_QUERY_LENGTH, MAX_YEAR, MIN_YEAR } from "./validation";
