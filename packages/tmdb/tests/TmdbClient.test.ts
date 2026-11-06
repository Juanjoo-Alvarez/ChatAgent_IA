import { describe, expect, it } from "vitest";

import {
  CANDIDATES_DISCLAIMER,
  DEFAULT_MIN_VOTES_WITH_RATING,
  TmdbClient,
  TmdbError,
  parseRetryAfter,
  type TmdbClientOptions
} from "../src";
import {
  ambiguousSearch,
  completeDetails,
  detailsWithoutExternalIds,
  detailsWithoutImdb,
  detailsWithoutPoster,
  discoverPage,
  emptySearch,
  genreList,
  singleExactSearch
} from "./fixtures/tmdb";
import { createFakeFetch, hangingRoute, jsonResponse, type Route } from "./helpers/fakeFetch";

const TOKEN = "test-read-token";

function setup(routes: Record<string, Route>, options: Partial<TmdbClientOptions> = {}) {
  const fake = createFakeFetch({ "/genre/movie/list": () => jsonResponse(genreList), ...routes });
  const client = new TmdbClient({ accessToken: TOKEN, fetch: fake.fetch, ...options });
  return { client, ...fake };
}

async function captureError(promise: Promise<unknown>): Promise<TmdbError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TmdbError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the promise to reject");
}

describe("TmdbClient configuration", () => {
  it("requires an access token", () => {
    expect(() => new TmdbClient({ accessToken: "  " })).toThrow(TmdbError);
  });

  it("rejects invalid timeouts", () => {
    expect(() => new TmdbClient({ accessToken: TOKEN, timeoutMs: 0 })).toThrow(TypeError);
  });
});

describe("TmdbClient.searchMovies", () => {
  it("sends the token as a bearer header and never in the URL", async () => {
    const { client, callsTo } = setup({ "/search/movie": () => jsonResponse(singleExactSearch) });

    await client.searchMovies({ query: "  Niebla ", year: 1990 });

    const [call] = callsTo("/search/movie");
    expect(call?.url.searchParams.get("query")).toBe("Niebla");
    expect(call?.url.searchParams.get("primary_release_year")).toBe("1990");
    expect(call?.url.searchParams.get("include_adult")).toBe("false");
    expect(call?.url.searchParams.get("language")).toBe("es-MX");
    expect(call?.url.toString()).not.toContain(TOKEN);
    expect(call?.init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it("returns normalized results with a unique exact match", async () => {
    const { client } = setup({ "/search/movie": () => jsonResponse(singleExactSearch) });

    const result = await client.searchMovies({ query: "niebla" });

    expect(result.results.map((movie) => movie.id)).toEqual([7101, 7102]);
    expect(result.exact_title_match_ids).toEqual([7101]);
    expect(result.ambiguous).toBe(false);
    expect(result.results[0]?.field_status.imdb_id).toBe("not_requested");
    expect(result.results[0]?.genres).toEqual(["Terror"]);
  });

  it("flags ambiguous titles with several exact matches", async () => {
    const { client } = setup({ "/search/movie": () => jsonResponse(ambiguousSearch) });

    const result = await client.searchMovies({ query: "La Casa" });

    expect(result.exact_title_match_ids).toEqual([7001, 7002]);
    expect(result.ambiguous).toBe(true);
    expect(result.total_results).toBe(3);
    expect(result.results[1]?.poster).toBeNull();
  });

  it("returns an empty, non-ambiguous result when nothing matches", async () => {
    const { client } = setup({ "/search/movie": () => jsonResponse(emptySearch) });

    const result = await client.searchMovies({ query: "zzzz" });

    expect(result).toMatchObject({ results: [], total_results: 0, ambiguous: false, skipped: 0 });
  });

  it("filters genres locally and accepts names without accents", async () => {
    const { client } = setup({ "/search/movie": () => jsonResponse(ambiguousSearch) });

    const result = await client.searchMovies({ query: "La casa", genres: ["drama"] });

    expect(result.results.map((movie) => movie.id)).toEqual([7002, 7003]);
    expect(result.filters_applied_locally).toEqual(["genres"]);
  });

  it("rejects unknown genres and lists the available ones", async () => {
    const { client, callsTo } = setup({ "/search/movie": () => jsonResponse(ambiguousSearch) });

    const error = await captureError(client.searchMovies({ query: "La casa", genres: ["Western", 28] }));

    expect(error.code).toBe("invalid_request");
    expect(error.details).toMatchObject({
      unknown_genres: ["Western"],
      available_genres: ["Acción", "Drama", "Terror", "Ciencia ficción"]
    });
    expect(callsTo("/search/movie")).toHaveLength(0);
  });

  it("still returns results when the genre catalog fails", async () => {
    const { client } = setup({
      "/search/movie": () => jsonResponse(ambiguousSearch),
      "/genre/movie/list": () => jsonResponse({}, 503)
    });

    const result = await client.searchMovies({ query: "La casa" });

    expect(result.results).toHaveLength(3);
    expect(result.results[0]?.field_status.genres).toBe("unavailable");
  });

  it("rejects malformed pages", async () => {
    const { client } = setup({ "/search/movie": () => jsonResponse({ page: 1 }) });

    expect((await captureError(client.searchMovies({ query: "x" }))).code).toBe("bad_response");
  });

  it("uses nulls when pagination metadata is missing", async () => {
    const { client } = setup({ "/search/movie": () => jsonResponse({ results: [] }) });

    const result = await client.searchMovies({ query: "x", page: 3 });

    expect(result).toMatchObject({ page: 3, total_pages: null, total_results: null });
  });

  it.each([
    [{ query: "" }],
    [{ query: "x".repeat(201) }],
    [{ query: "x", page: 0 }],
    [{ query: "x", page: 501 }],
    [{ query: "x", year: 1700 }],
    [{ query: "x", genres: Array.from({ length: 21 }, (_, index) => index) }]
  ])("validates parameters %#", async (params) => {
    const { client, calls } = setup({});

    expect((await captureError(client.searchMovies(params))).code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });
});

describe("TmdbClient.getMovieDetails", () => {
  it("retrieves details and the IMDb id in a single request", async () => {
    const { client, calls } = setup({ "/movie/9001": () => jsonResponse(completeDetails) });

    const movie = await client.getMovieDetails(9001);

    expect(movie.imdb_id).toBe("tt9900001");
    expect(movie.reference.kind).toBe("imdb");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.searchParams.get("append_to_response")).toBe("external_ids");
  });

  it("returns movies without poster or IMDb id", async () => {
    const { client } = setup({
      "/movie/9002": () => jsonResponse(detailsWithoutPoster),
      "/movie/9003": () => jsonResponse(detailsWithoutImdb)
    });

    const withoutPoster = await client.getMovieDetails(9002);
    const withoutImdb = await client.getMovieDetails(9003);

    expect(withoutPoster.field_status.poster).toBe("missing");
    expect(withoutPoster.imdb_id).toBe("tt9900001");
    expect(withoutImdb.imdb_id).toBeNull();
    expect(withoutImdb.field_status.imdb_id).toBe("missing");
    expect(withoutImdb.reference).toEqual({
      kind: "tmdb",
      id: "9003",
      url: "https://www.themoviedb.org/movie/9003"
    });
  });

  it("queries external ids separately when the details omit them", async () => {
    const { client, callsTo } = setup({
      "/movie/9004": () => jsonResponse(detailsWithoutExternalIds),
      "/movie/9004/external_ids": () => jsonResponse({ id: 9004, imdb_id: "tt9900004" })
    });

    const movie = await client.getMovieDetails(9004);

    expect(movie.imdb_id).toBe("tt9900004");
    expect(callsTo("/movie/9004/external_ids")).toHaveLength(1);
  });

  it("marks IMDb as unavailable when the external ids request fails", async () => {
    const { client } = setup({
      "/movie/9004": () => jsonResponse(detailsWithoutExternalIds),
      "/movie/9004/external_ids": () => jsonResponse({}, 500)
    });

    const movie = await client.getMovieDetails(9004);

    expect(movie.imdb_id).toBeNull();
    expect(movie.field_status.imdb_id).toBe("unavailable");
    expect(movie.title).toBe("Respuesta parcial");
  });

  it("propagates invalid credentials from the external ids request", async () => {
    const { client } = setup({
      "/movie/9004": () => jsonResponse(detailsWithoutExternalIds),
      "/movie/9004/external_ids": () => jsonResponse({ status_code: 7 }, 401)
    });

    expect((await captureError(client.getMovieDetails(9004))).code).toBe("invalid_credentials");
  });

  it("uses the top-level imdb_id when external ids are not appended", async () => {
    const { client, calls } = setup({
      "/movie/9010": () => jsonResponse({ id: 9010, imdb_id: null })
    });

    const movie = await client.getMovieDetails(9010);

    expect(movie.field_status.imdb_id).toBe("missing");
    expect(calls).toHaveLength(1);
  });

  it("reports not found movies", async () => {
    const { client } = setup({});

    const error = await captureError(client.getMovieDetails(123));

    expect(error).toMatchObject({ code: "not_found", status: 404, retryable: false });
    expect(error.details).toEqual({ tmdb_status_code: 34 });
  });

  it("rejects malformed detail bodies", async () => {
    const { client } = setup({
      "/movie/1": () => jsonResponse(["no"]),
      "/movie/2": () => jsonResponse({ id: "2" })
    });

    expect((await captureError(client.getMovieDetails(1))).code).toBe("bad_response");
    expect((await captureError(client.getMovieDetails(2))).code).toBe("bad_response");
  });

  it("validates the movie id before calling TMDB", async () => {
    const { client, calls } = setup({});

    expect((await captureError(client.getMovieDetails(0))).code).toBe("invalid_request");
    expect((await captureError(client.getMovieDetails(1.5))).code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });
});

describe("TmdbClient.getExternalIds", () => {
  it("returns validated IMDb ids", async () => {
    const { client } = setup({
      "/movie/1/external_ids": () => jsonResponse({ imdb_id: "tt1234567" }),
      "/movie/2/external_ids": () => jsonResponse({ imdb_id: "bad" }),
      "/movie/3/external_ids": () => jsonResponse("text")
    });

    expect(await client.getExternalIds(1)).toEqual({ id: 1, imdb_id: "tt1234567", imdb_status: "present" });
    expect(await client.getExternalIds(2)).toEqual({ id: 2, imdb_id: null, imdb_status: "invalid" });
    expect((await captureError(client.getExternalIds(3))).code).toBe("bad_response");
  });
});

describe("TmdbClient.discoverMovies and candidates", () => {
  it("maps preferences to TMDB discover filters", async () => {
    const { client, callsTo } = setup({ "/discover/movie": () => jsonResponse(discoverPage) });

    const page = await client.discoverMovies({
      genres: ["Ciencia ficción", "Acción"],
      yearFrom: 2010,
      yearTo: 2020,
      minRating: 7,
      originalLanguage: "en",
      sortBy: "vote_average.desc",
      page: 2
    });

    const params = callsTo("/discover/movie")[0]?.url.searchParams;
    expect(params?.get("with_genres")).toBe("878|28");
    expect(params?.get("primary_release_date.gte")).toBe("2010-01-01");
    expect(params?.get("primary_release_date.lte")).toBe("2020-12-31");
    expect(params?.get("vote_average.gte")).toBe("7");
    expect(params?.get("vote_count.gte")).toBe(String(DEFAULT_MIN_VOTES_WITH_RATING));
    expect(params?.get("with_original_language")).toBe("en");
    expect(params?.get("sort_by")).toBe("vote_average.desc");
    expect(page).toMatchObject({ page: 2, total_pages: 40, total_results: 800, skipped: 1 });
    expect(page.results[0]?.genres).toEqual(["Ciencia ficción", "Acción"]);
  });

  it("uses AND for genres when all of them are required", async () => {
    const { client, callsTo } = setup({ "/discover/movie": () => jsonResponse(discoverPage) });

    await client.discoverMovies({ genres: [878, 28], genreMatch: "all", year: 2015 });

    const params = callsTo("/discover/movie")[0]?.url.searchParams;
    expect(params?.get("with_genres")).toBe("878,28");
    expect(params?.get("primary_release_year")).toBe("2015");
    expect(params?.get("sort_by")).toBe("popularity.desc");
    expect(params?.has("vote_count.gte")).toBe(false);
  });

  it("returns discover candidates labelled as non-personalized", async () => {
    const { client } = setup({ "/discover/movie": () => jsonResponse(discoverPage) });

    const result = await client.getMovieCandidates({ genres: ["Acción"], minRating: 7, minVoteCount: 10 });

    expect(result).toMatchObject({
      kind: "candidates",
      strategy: "discover",
      disclaimer: CANDIDATES_DISCLAIMER,
      ignored_filters: [],
      applied_filters: { genres: ["Acción"], min_rating: 7, min_vote_count: 10, sort_by: "popularity.desc" }
    });
    expect(result.candidates.map((movie) => movie.id)).toEqual([8001]);
  });

  it("filters search candidates locally and reports what could not be applied", async () => {
    const { client } = setup({ "/search/movie": () => jsonResponse(ambiguousSearch) });

    const result = await client.getMovieCandidates({
      query: "La casa",
      genres: ["Terror", "Drama"],
      genreMatch: "all",
      yearFrom: 2000,
      minRating: 5,
      minVoteCount: 100,
      sortBy: "popularity.desc",
      originalLanguage: "es"
    });

    expect(result.strategy).toBe("search");
    expect(result.candidates.map((movie) => movie.id)).toEqual([7002]);
    expect(result.filters_applied_locally).toEqual(["genres", "year_range", "min_rating", "min_vote_count"]);
    expect(result.ignored_filters).toEqual(["sort_by", "original_language"]);
    expect(result.applied_filters).toMatchObject({ query: "La casa", genres: ["Terror", "Drama"], sort_by: null });
  });

  it("rejects contradictory or invalid criteria", async () => {
    const { client, calls } = setup({});

    const cases = [
      client.getMovieCandidates({ year: 2000, yearFrom: 1990 }),
      client.getMovieCandidates({ yearFrom: 2020, yearTo: 2010 }),
      client.getMovieCandidates({ minRating: 11 }),
      client.getMovieCandidates({ minVoteCount: -2 }),
      client.getMovieCandidates({ originalLanguage: "spanish" }),
      client.getMovieCandidates({ sortBy: "revenue.desc" as never }),
      client.getMovieCandidates({ query: "  " })
    ];

    for (const promise of cases) {
      expect((await captureError(promise)).code).toBe("invalid_request");
    }
    expect(calls).toHaveLength(0);
  });
});

describe("TmdbClient.getGenres", () => {
  it("reuses the catalog and retries after a failure", async () => {
    let attempts = 0;
    const { client, callsTo } = setup({
      "/genre/movie/list": () => {
        attempts += 1;
        return attempts === 1 ? jsonResponse({}, 503) : jsonResponse(genreList);
      }
    });

    expect((await captureError(client.getGenres())).code).toBe("unavailable");
    await client.getGenres();
    await client.getGenres();

    expect(callsTo("/genre/movie/list")).toHaveLength(2);
  });

  it("ignores malformed genres and rejects malformed catalogs", async () => {
    const valid = setup({
      "/genre/movie/list": () => jsonResponse({ genres: [{ id: 1, name: " Drama " }, { id: 2 }, "x"] })
    });
    const invalid = setup({ "/genre/movie/list": () => jsonResponse({}) });

    expect(await valid.client.getGenres()).toEqual([{ id: 1, name: "Drama" }]);
    expect((await captureError(invalid.client.getGenres())).code).toBe("bad_response");
  });
});

describe("TmdbClient error classification", () => {
  const search = (route: Route, options: Partial<TmdbClientOptions> = {}) =>
    captureError(setup({ "/search/movie": route }, options).client.searchMovies({ query: "x" }));

  it("classifies HTTP failures", async () => {
    expect(await search(() => jsonResponse({ status_code: 7 }, 401))).toMatchObject({
      code: "invalid_credentials",
      retryable: false
    });
    expect(await search(() => jsonResponse({}, 403))).toMatchObject({ code: "invalid_credentials" });
    expect(await search(() => jsonResponse({ status_code: 25 }, 429, { "Retry-After": "3" }))).toMatchObject({
      code: "rate_limited",
      retryable: true,
      retryAfterMs: 3000
    });
    expect(await search(() => jsonResponse({}, 503))).toMatchObject({ code: "unavailable", retryable: true });
    expect(await search(() => jsonResponse({}, 422))).toMatchObject({ code: "invalid_request", retryable: false });
    expect(await search(() => new Response("teapot", { status: 418 }))).toMatchObject({
      code: "unexpected_status",
      details: undefined
    });
  });

  it("classifies connection failures as network errors", async () => {
    const error = await search(() => Promise.reject(new TypeError("fetch failed")));

    expect(error).toMatchObject({ code: "network", retryable: true });
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it("aborts slow requests with a timeout error", async () => {
    expect(await search(hangingRoute, { timeoutMs: 20 })).toMatchObject({ code: "timeout", retryable: true });
  });

  it("rejects bodies that are not JSON", async () => {
    expect(await search(() => new Response("<html>", { status: 200 }))).toMatchObject({ code: "bad_response" });
  });

  it("keeps the credential out of serialized errors", async () => {
    const error = await search(() => jsonResponse({}, 401));

    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(error.toJSON()).toEqual({
      code: "invalid_credentials",
      message: "TMDB responded with HTTP 401",
      retryable: false,
      status: 401,
      retry_after_ms: null,
      details: null
    });
  });

  it("lets typed errors from an injected fetch pass through", async () => {
    const injected = new TmdbError({ code: "rate_limited", message: "local quota" });

    expect(await search(() => Promise.reject(injected))).toBe(injected);
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds and HTTP dates", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");

    expect(parseRetryAfter("5", now)).toBe(5000);
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(10000);
    expect(parseRetryAfter("Wed, 31 Dec 2025 00:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("soon", now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter(" ", now)).toBeUndefined();
  });
});
