import {
  QuotaExceededError,
  QuotaUnavailableError,
  ReadThroughCache,
  buildCacheKey
} from "@agichat/external-api";
import type { CacheStore, FetchLike } from "@agichat/external-api";

import { TmdbError, errorFromResponse } from "./errors";
import {
  comparisonKey,
  hasValidTmdbId,
  isRecord,
  normalizeMovie,
  readImdbId,
  type ImdbLookup
} from "./normalize";
import type {
  AppliedFilters,
  CandidateCriteria,
  CandidateResult,
  DiscoverMoviesParams,
  ExternalIdsResult,
  Genre,
  GenreInput,
  GenreMatch,
  Movie,
  MoviePage,
  MovieSearchResult,
  SearchMoviesParams
} from "./types";
import {
  assertGenreCount,
  assertLanguageCode,
  assertMinRating,
  assertMinVoteCount,
  assertMovieId,
  assertPage,
  assertQuery,
  assertSortBy,
  assertYearCriteria
} from "./validation";

export const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
export const DEFAULT_POSTER_SIZE = "w500";
export const DEFAULT_LANGUAGE = "es-MX";
export const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Con `min_rating` y sin mínimo de votos, TMDB devuelve películas con un solo
 * voto de 10. Este mínimo evita esos candidatos y siempre se informa en
 * `applied_filters`; el consumidor puede reemplazarlo.
 */
export const DEFAULT_MIN_VOTES_WITH_RATING = 50;

export const CANDIDATES_DISCLAIMER =
  "Candidatos obtenidos con filtros de TMDB. No constituyen recomendaciones personalizadas definitivas.";

/** Proveedor con el que se registran las solicitudes en la política de cuotas. */
export const TMDB_QUOTA_PROVIDER = "tmdb";

/** Versión del contrato en las claves: cambiarla invalida la caché anterior. */
export const TMDB_CACHE_NAMESPACE = "tmdb:v1";

export interface TmdbCacheTtl {
  readonly genres: number;
  readonly details: number;
  readonly externalIds: number;
  readonly search: number;
  readonly discover: number;
}

// Géneros, detalles e identificadores cambian poco; los listados dependen de
// popularidad y votos, que TMDB actualiza con frecuencia.
export const DEFAULT_TMDB_CACHE_TTL_MS: TmdbCacheTtl = {
  genres: 24 * 60 * 60 * 1000,
  details: 24 * 60 * 60 * 1000,
  externalIds: 24 * 60 * 60 * 1000,
  search: 15 * 60 * 1000,
  discover: 15 * 60 * 1000
};

export interface TmdbCacheOptions {
  readonly store: CacheStore;
  readonly ttlMs?: Partial<TmdbCacheTtl> | undefined;
  readonly onStoreError?: ((error: unknown, operation: "get" | "set" | "delete") => void) | undefined;
}

export interface TmdbClientOptions {
  /** Token de lectura de la API (v4). Debe provenir de variables de entorno. */
  readonly accessToken: string;
  /**
   * Transporte HTTP. Para aplicar cuotas y reintentos, pasar
   * `createResilientFetch({ provider: TMDB_QUOTA_PROVIDER, quota })`.
   */
  readonly fetch?: FetchLike | undefined;
  /** Sin esta opción el cliente no guarda resultados. */
  readonly cache?: TmdbCacheOptions | undefined;
  readonly baseUrl?: string | undefined;
  readonly imageBaseUrl?: string | undefined;
  readonly posterSize?: string | undefined;
  /** Idioma de títulos, sinopsis y géneros, por ejemplo `es-MX`. */
  readonly language?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

type QueryValue = string | number | boolean | undefined;

interface RawPage {
  readonly items: readonly unknown[];
  readonly page: number;
  readonly totalPages: number | null;
  readonly totalResults: number | null;
}

interface GenreFilter {
  readonly ids: ReadonlySet<number>;
  readonly names: readonly string[];
}

function badResponse(message: string, cause?: unknown): TmdbError {
  return new TmdbError({ code: "bad_response", message, cause });
}

function readCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function readPage(body: unknown, requestedPage: number): RawPage {
  if (!isRecord(body) || !Array.isArray(body.results)) {
    throw badResponse("TMDB returned a page without a results list");
  }
  return {
    items: body.results,
    page: readCount(body.page) ?? requestedPage,
    totalPages: readCount(body.total_pages),
    totalResults: readCount(body.total_results)
  };
}

function matchesGenres(item: unknown, filter: GenreFilter, mode: GenreMatch): boolean {
  if (!isRecord(item) || !Array.isArray(item.genre_ids)) {
    return false;
  }
  const ids = new Set(item.genre_ids);
  const wanted = [...filter.ids];
  return mode === "all" ? wanted.every((id) => ids.has(id)) : wanted.some((id) => ids.has(id));
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Un listado con géneros no disponibles es un resultado degradado: no se guarda. */
function isCompletePage(page: MoviePage): boolean {
  return page.results.every((movie) => movie.field_status.genres !== "unavailable");
}

export class TmdbClient {
  private readonly accessToken: string;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly imageBaseUrl: string;
  private readonly posterSize: string;
  private readonly language: string;
  private readonly timeoutMs: number;
  private readonly cache: ReadThroughCache | null;
  private readonly cacheTtl: TmdbCacheTtl;
  private genresPromise: Promise<readonly Genre[]> | null = null;

  public constructor(options: TmdbClientOptions) {
    if (options.accessToken.trim() === "") {
      throw new TmdbError({
        code: "invalid_credentials",
        message: "A TMDB access token is required"
      });
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("timeoutMs must be a positive number");
    }

    this.accessToken = options.accessToken.trim();
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.baseUrl = stripTrailingSlash(options.baseUrl ?? TMDB_API_BASE_URL);
    this.imageBaseUrl = stripTrailingSlash(options.imageBaseUrl ?? TMDB_IMAGE_BASE_URL);
    this.posterSize = options.posterSize ?? DEFAULT_POSTER_SIZE;
    this.language = options.language ?? DEFAULT_LANGUAGE;
    this.timeoutMs = timeoutMs;
    this.cacheTtl = { ...DEFAULT_TMDB_CACHE_TTL_MS, ...options.cache?.ttlMs };
    this.cache =
      options.cache === undefined
        ? null
        : new ReadThroughCache(
            options.cache.store,
            options.cache.onStoreError === undefined ? {} : { onStoreError: options.cache.onStoreError }
          );
  }

  /** Busca por título. TMDB no filtra por género aquí, así que se filtra la página. */
  public async searchMovies(params: SearchMoviesParams): Promise<MovieSearchResult> {
    return this.search(params, "any");
  }

  /** Detalles de una película, con el identificador IMDb cuando TMDB lo conoce. */
  public async getMovieDetails(movieId: number): Promise<Movie> {
    const id = assertMovieId(movieId);
    return this.cached("details", { id }, "details", () => this.loadDetails(id), (movie) =>
      movie.field_status.imdb_id !== "unavailable"
    );
  }

  public async getExternalIds(movieId: number): Promise<ExternalIdsResult> {
    const id = assertMovieId(movieId);
    return this.cached("external_ids", { id }, "externalIds", async () => {
      const body = await this.request(`/movie/${id}/external_ids`, {});
      if (!isRecord(body)) {
        throw badResponse("TMDB returned external ids in an unexpected format");
      }
      const imdb = readImdbId(body.imdb_id);
      return { id, imdb_id: imdb.value, imdb_status: imdb.status };
    });
  }

  public async discoverMovies(params: DiscoverMoviesParams): Promise<MoviePage> {
    const { query, page } = await this.buildDiscoverQuery(params);
    return this.fetchDiscoverPage(query, page);
  }

  /**
   * Obtiene candidatos a partir de preferencias. Con término de búsqueda usa
   * `/search/movie` y aplica los filtros restantes sobre la página; sin él,
   * delega todos los filtros en `/discover/movie`.
   */
  public async getMovieCandidates(criteria: CandidateCriteria): Promise<CandidateResult> {
    if (criteria.query !== undefined) {
      return this.candidatesFromSearch(criteria);
    }

    const { query, page, filters } = await this.buildDiscoverQuery(criteria);
    const moviePage = await this.fetchDiscoverPage(query, page);

    return {
      kind: "candidates",
      strategy: "discover",
      candidates: moviePage.results,
      page: moviePage.page,
      total_pages: moviePage.total_pages,
      total_results: moviePage.total_results,
      skipped: moviePage.skipped,
      applied_filters: filters,
      filters_applied_locally: [],
      ignored_filters: [],
      disclaimer: CANDIDATES_DISCLAIMER
    };
  }

  /** Catálogo de géneros en el idioma configurado; se reintenta si falla. */
  public getGenres(): Promise<readonly Genre[]> {
    this.genresPromise ??= this.cached("genres", {}, "genres", () => this.fetchGenres(), (genres) =>
      genres.length > 0
    ).catch((error: unknown) => {
      this.genresPromise = null;
      throw error;
    });
    return this.genresPromise;
  }

  private async loadDetails(id: number): Promise<Movie> {
    const body = await this.request(`/movie/${id}`, {
      language: this.language,
      append_to_response: "external_ids"
    });

    if (!isRecord(body)) {
      throw badResponse("TMDB returned movie details in an unexpected format");
    }

    const movie = normalizeMovie(body, {
      ...this.imageContext(),
      genresById: null,
      imdb: await this.resolveImdb(id, body)
    });
    if (movie === null) {
      throw badResponse("TMDB returned movie details without a valid id");
    }
    return movie;
  }

  private async search(
    params: SearchMoviesParams,
    genreMatch: GenreMatch
  ): Promise<MovieSearchResult> {
    const query = assertQuery(params.query);
    const { year } = assertYearCriteria(params.year, undefined, undefined);
    const page = assertPage(params.page);
    const genreFilter = await this.resolveGenreFilter(params.genres);
    const genreIds = genreFilter === null ? [] : [...genreFilter.ids].sort((a, b) => a - b);

    return this.cached(
      "search",
      { query, year, page, genre_ids: genreIds, genre_match: genreFilter === null ? null : genreMatch },
      "search",
      () => this.loadSearch(query, year, page, genreFilter, genreMatch),
      isCompletePage
    );
  }

  private async loadSearch(
    query: string,
    year: number | undefined,
    page: number,
    genreFilter: GenreFilter | null,
    genreMatch: GenreMatch
  ): Promise<MovieSearchResult> {
    const raw = readPage(
      await this.request("/search/movie", {
        query,
        primary_release_year: year,
        page,
        include_adult: false,
        language: this.language
      }),
      page
    );

    const items =
      genreFilter === null
        ? raw.items
        : raw.items.filter((item) => matchesGenres(item, genreFilter, genreMatch));
    const moviePage = await this.toMoviePage(raw, items);

    const queryKey = comparisonKey(query);
    const exactIds = moviePage.results
      .filter((movie) =>
        [movie.title, movie.original_title].some(
          (title) => title !== null && comparisonKey(title) === queryKey
        )
      )
      .map((movie) => movie.id);

    return {
      ...moviePage,
      query,
      exact_title_match_ids: exactIds,
      ambiguous: moviePage.results.length > 1 && exactIds.length !== 1,
      filters_applied_locally: genreFilter === null ? [] : ["genres"]
    };
  }

  private async candidatesFromSearch(criteria: CandidateCriteria): Promise<CandidateResult> {
    const years = assertYearCriteria(criteria.year, criteria.yearFrom, criteria.yearTo);
    const minRating = assertMinRating(criteria.minRating);
    const minVoteCount = assertMinVoteCount(criteria.minVoteCount);
    const genreMatch = criteria.genreMatch ?? "any";
    const sortBy = assertSortBy(criteria.sortBy);
    const originalLanguage = assertLanguageCode(criteria.originalLanguage);
    const genreFilter = await this.resolveGenreFilter(criteria.genres);

    const search = await this.search(
      { query: criteria.query ?? "", year: years.year, genres: criteria.genres, page: criteria.page },
      genreMatch
    );

    const local = [...search.filters_applied_locally];
    let candidates = search.results;

    if (years.yearFrom !== undefined || years.yearTo !== undefined) {
      const from = years.yearFrom ?? Number.NEGATIVE_INFINITY;
      const to = years.yearTo ?? Number.POSITIVE_INFINITY;
      candidates = candidates.filter((movie) => movie.year !== null && movie.year >= from && movie.year <= to);
      local.push("year_range");
    }
    if (minRating !== undefined) {
      candidates = candidates.filter((movie) => movie.rating !== null && movie.rating >= minRating);
      local.push("min_rating");
    }
    if (minVoteCount !== undefined) {
      candidates = candidates.filter(
        (movie) => movie.vote_count !== null && movie.vote_count >= minVoteCount
      );
      local.push("min_vote_count");
    }

    return {
      kind: "candidates",
      strategy: "search",
      candidates,
      page: search.page,
      total_pages: search.total_pages,
      total_results: search.total_results,
      skipped: search.skipped,
      applied_filters: {
        query: search.query,
        genres: genreFilter?.names ?? [],
        genre_match: genreMatch,
        year: years.year ?? null,
        year_from: years.yearFrom ?? null,
        year_to: years.yearTo ?? null,
        min_rating: minRating ?? null,
        min_vote_count: minVoteCount ?? null,
        // La búsqueda de TMDB ordena por relevancia y no filtra por idioma.
        sort_by: null,
        original_language: null
      },
      filters_applied_locally: local,
      ignored_filters: [
        ...(sortBy === undefined ? [] : ["sort_by"]),
        ...(originalLanguage === undefined ? [] : ["original_language"])
      ],
      disclaimer: CANDIDATES_DISCLAIMER
    };
  }

  private async buildDiscoverQuery(params: DiscoverMoviesParams): Promise<{
    readonly query: Record<string, QueryValue>;
    readonly page: number;
    readonly filters: AppliedFilters;
  }> {
    const years = assertYearCriteria(params.year, params.yearFrom, params.yearTo);
    const minRating = assertMinRating(params.minRating);
    const minVoteCount =
      assertMinVoteCount(params.minVoteCount) ??
      (minRating === undefined ? undefined : DEFAULT_MIN_VOTES_WITH_RATING);
    const sortBy = assertSortBy(params.sortBy) ?? "popularity.desc";
    const originalLanguage = assertLanguageCode(params.originalLanguage);
    const page = assertPage(params.page);
    const genreMatch = params.genreMatch ?? "any";
    const genreFilter = await this.resolveGenreFilter(params.genres);

    // En TMDB, "|" combina géneros con OR y "," con AND.
    const withGenres =
      genreFilter === null ? undefined : [...genreFilter.ids].join(genreMatch === "any" ? "|" : ",");

    return {
      page,
      query: {
        with_genres: withGenres,
        primary_release_year: years.year,
        "primary_release_date.gte": years.yearFrom === undefined ? undefined : `${years.yearFrom}-01-01`,
        "primary_release_date.lte": years.yearTo === undefined ? undefined : `${years.yearTo}-12-31`,
        "vote_average.gte": minRating,
        "vote_count.gte": minVoteCount,
        with_original_language: originalLanguage,
        sort_by: sortBy,
        include_adult: false,
        language: this.language,
        page
      },
      filters: {
        query: null,
        genres: genreFilter?.names ?? [],
        genre_match: genreMatch,
        year: years.year ?? null,
        year_from: years.yearFrom ?? null,
        year_to: years.yearTo ?? null,
        min_rating: minRating ?? null,
        min_vote_count: minVoteCount ?? null,
        sort_by: sortBy,
        original_language: originalLanguage ?? null
      }
    };
  }

  private async resolveImdb(id: number, body: Record<string, unknown>): Promise<ImdbLookup> {
    const external = isRecord(body.external_ids) ? body.external_ids : null;
    const candidates = [external?.imdb_id, body.imdb_id];
    const value = candidates.find((candidate) => candidate !== undefined && candidate !== null);

    if (value !== undefined) {
      return { kind: "value", value };
    }
    // TMDB respondió explícitamente que no conoce un identificador IMDb.
    if (external !== null || "imdb_id" in body) {
      return { kind: "value", value: null };
    }

    // `append_to_response` no trajo los identificadores: se consultan aparte y,
    // si fallan, la película se entrega igual marcando IMDb como no disponible.
    try {
      const ids = await this.getExternalIds(id);
      return { kind: "value", value: ids.imdb_id };
    } catch (error) {
      if (error instanceof TmdbError && error.code !== "invalid_credentials") {
        return { kind: "unavailable" };
      }
      throw error;
    }
  }

  private async resolveGenreFilter(
    genres: readonly GenreInput[] | undefined
  ): Promise<GenreFilter | null> {
    if (genres === undefined || genres.length === 0) {
      return null;
    }
    assertGenreCount(genres.length);

    const catalog = await this.getGenres();
    const ids = new Set<number>();
    const names: string[] = [];
    const unknown: GenreInput[] = [];

    for (const input of genres) {
      const genre =
        typeof input === "number"
          ? catalog.find((item) => item.id === input)
          : catalog.find((item) => comparisonKey(item.name) === comparisonKey(input));

      if (genre === undefined) {
        unknown.push(input);
      } else if (!ids.has(genre.id)) {
        ids.add(genre.id);
        names.push(genre.name);
      }
    }

    if (unknown.length > 0) {
      throw new TmdbError({
        code: "invalid_request",
        message: "Some genres are not recognized by TMDB",
        details: {
          unknown_genres: unknown,
          available_genres: catalog.map((genre) => genre.name)
        }
      });
    }
    return { ids, names };
  }

  private async fetchGenres(): Promise<readonly Genre[]> {
    const body = await this.request("/genre/movie/list", { language: this.language });
    if (!isRecord(body) || !Array.isArray(body.genres)) {
      throw badResponse("TMDB returned the genre list in an unexpected format");
    }
    return body.genres.flatMap((genre) =>
      isRecord(genre) && hasValidTmdbId(genre) && typeof genre.name === "string" && genre.name.trim() !== ""
        ? [{ id: genre.id as number, name: genre.name.trim() }]
        : []
    );
  }

  /** Los géneros solo enriquecen listados: si fallan, el listado se entrega igual. */
  private async tryGenreMap(): Promise<ReadonlyMap<number, string> | null> {
    try {
      const genres = await this.getGenres();
      return new Map(genres.map((genre) => [genre.id, genre.name]));
    } catch (error) {
      if (error instanceof TmdbError) {
        return null;
      }
      throw error;
    }
  }

  private fetchDiscoverPage(query: Record<string, QueryValue>, page: number): Promise<MoviePage> {
    // La consulta ya validada y con géneros resueltos es la clave más precisa.
    return this.cached(
      "discover",
      query,
      "discover",
      async () => {
        const raw = readPage(await this.request("/discover/movie", query), page);
        return this.toMoviePage(raw, raw.items);
      },
      isCompletePage
    );
  }

  /**
   * Las claves incluyen idioma y configuración de imágenes, porque ambos
   * cambian el resultado normalizado. Sin caché configurada, carga directo.
   */
  private cached<T>(
    operation: string,
    params: Readonly<Record<string, unknown>>,
    ttl: keyof TmdbCacheTtl,
    load: () => Promise<T>,
    shouldCache?: (value: T) => boolean
  ): Promise<T> {
    if (this.cache === null) {
      return load();
    }
    const key = buildCacheKey(TMDB_CACHE_NAMESPACE, operation, {
      ...params,
      _language: this.language,
      _images: `${this.imageBaseUrl}/${this.posterSize}`
    });
    return this.cache.getOrLoad(key, load, {
      ttlMs: this.cacheTtl[ttl],
      ...(shouldCache === undefined ? {} : { shouldCache })
    });
  }

  private async toMoviePage(raw: RawPage, items: readonly unknown[]): Promise<MoviePage> {
    const context = {
      ...this.imageContext(),
      genresById: await this.tryGenreMap(),
      imdb: { kind: "not_requested" } as const
    };

    const results: Movie[] = [];
    let skipped = 0;
    for (const item of items) {
      const movie = normalizeMovie(item, context);
      if (movie === null) {
        skipped += 1;
      } else {
        results.push(movie);
      }
    }

    return {
      results,
      page: raw.page,
      total_pages: raw.totalPages,
      total_results: raw.totalResults,
      skipped
    };
  }

  private imageContext(): { readonly imageBaseUrl: string; readonly posterSize: string } {
    return { imageBaseUrl: this.imageBaseUrl, posterSize: this.posterSize };
  }

  private async request(path: string, query: Record<string, QueryValue>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    const timeoutError = (cause: unknown): TmdbError =>
      new TmdbError({
        code: "timeout",
        message: `TMDB did not respond within ${this.timeoutMs} ms`,
        cause
      });

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.accessToken}`
          },
          signal: controller.signal
        });
      } catch (error) {
        if (timedOut) {
          throw timeoutError(error);
        }
        if (error instanceof TmdbError) {
          throw error;
        }
        if (error instanceof QuotaExceededError) {
          throw new TmdbError({
            code: "quota_exhausted",
            message: "The configured TMDB quota is exhausted; the request was not sent",
            retryAfterMs: error.retryAfterMs,
            cause: error
          });
        }
        if (error instanceof QuotaUnavailableError) {
          throw new TmdbError({
            code: "quota_unavailable",
            message: "The quota store is unavailable; the request was not sent",
            cause: error
          });
        }
        throw new TmdbError({
          code: "network",
          message: "Could not connect to TMDB",
          cause: error
        });
      }

      if (!response.ok) {
        throw await errorFromResponse(response);
      }

      try {
        return (await response.json()) as unknown;
      } catch (error) {
        throw timedOut ? timeoutError(error) : badResponse("TMDB returned a body that is not valid JSON", error);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
