import {
  InMemoryCacheStore,
  InMemoryQuotaStore,
  QuotaManager,
  createResilientFetch,
  type QuotaStore
} from "@agichat/external-api";
import { describe, expect, it } from "vitest";

import { DEFAULT_TMDB_CACHE_TTL_MS, TMDB_QUOTA_PROVIDER, TmdbClient, TmdbError } from "../src";
import {
  ambiguousSearch,
  completeDetails,
  detailsWithoutExternalIds,
  discoverPage,
  genreList
} from "./fixtures/tmdb";
import { createFakeFetch, jsonResponse, type Route } from "./helpers/fakeFetch";

const TOKEN = "test-read-token";

function clock() {
  let now = 1_000_000;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

function cachedClient(routes: Record<string, Route>, store = new InMemoryCacheStore()) {
  const fake = createFakeFetch({ "/genre/movie/list": () => jsonResponse(genreList), ...routes });
  const client = new TmdbClient({ accessToken: TOKEN, fetch: fake.fetch, cache: { store } });
  return { client, store, ...fake };
}

describe("TmdbClient cache", () => {
  it("reuses recent search results", async () => {
    const { client, callsTo } = cachedClient({ "/search/movie": () => jsonResponse(ambiguousSearch) });

    const first = await client.searchMovies({ query: "La casa" });
    const second = await client.searchMovies({ query: "La casa" });

    expect(second).toEqual(first);
    expect(callsTo("/search/movie")).toHaveLength(1);
  });

  it("distinguishes different parameters", async () => {
    const { client, callsTo } = cachedClient({ "/search/movie": () => jsonResponse(ambiguousSearch) });

    await client.searchMovies({ query: "La casa" });
    await client.searchMovies({ query: "La casa", page: 2 });
    await client.searchMovies({ query: "La casa", year: 1990 });
    await client.searchMovies({ query: "La casa", genres: ["Drama"] });
    await client.searchMovies({ query: "La casa", genres: [18] });

    // El nombre y el ID del mismo género producen la misma consulta.
    expect(callsTo("/search/movie")).toHaveLength(4);
  });

  it("shares cached data between clients that use the same store", async () => {
    const store = new InMemoryCacheStore();
    const replicaA = cachedClient({ "/movie/9001": () => jsonResponse(completeDetails) }, store);
    const replicaB = cachedClient({ "/movie/9001": () => jsonResponse(completeDetails) }, store);

    await replicaA.client.getMovieDetails(9001);
    const movie = await replicaB.client.getMovieDetails(9001);

    expect(movie.imdb_id).toBe("tt9900001");
    expect(replicaB.calls).toHaveLength(0);
  });

  it("expires entries according to the TTL of each operation", async () => {
    const time = clock();
    const store = new InMemoryCacheStore({ now: time.now });
    const { client, callsTo } = cachedClient(
      {
        "/discover/movie": () => jsonResponse(discoverPage),
        "/movie/9001": () => jsonResponse(completeDetails)
      },
      store
    );

    await client.discoverMovies({ genres: ["Acción"] });
    await client.getMovieDetails(9001);
    time.advance(DEFAULT_TMDB_CACHE_TTL_MS.discover);
    await client.discoverMovies({ genres: ["Acción"] });
    await client.getMovieDetails(9001);

    expect(callsTo("/discover/movie")).toHaveLength(2);
    expect(callsTo("/movie/9001")).toHaveLength(1);
  });

  it("allows overriding TTLs", async () => {
    const time = clock();
    const fake = createFakeFetch({ "/movie/9001": () => jsonResponse(completeDetails) });
    const client = new TmdbClient({
      accessToken: TOKEN,
      fetch: fake.fetch,
      cache: { store: new InMemoryCacheStore({ now: time.now }), ttlMs: { details: 10 } }
    });

    await client.getMovieDetails(9001);
    time.advance(10);
    await client.getMovieDetails(9001);

    expect(fake.calls).toHaveLength(2);
  });

  it("does not store errors or degraded results", async () => {
    let fail = true;
    const { client, callsTo } = cachedClient({
      "/search/movie": () => (fail ? jsonResponse({}, 503) : jsonResponse(ambiguousSearch)),
      "/movie/9004": () => jsonResponse(detailsWithoutExternalIds),
      "/movie/9004/external_ids": () => jsonResponse({}, 500)
    });

    await expect(client.searchMovies({ query: "La casa" })).rejects.toBeInstanceOf(TmdbError);
    fail = false;
    await client.searchMovies({ query: "La casa" });
    expect(callsTo("/search/movie")).toHaveLength(2);

    expect((await client.getMovieDetails(9004)).field_status.imdb_id).toBe("unavailable");
    await client.getMovieDetails(9004);
    expect(callsTo("/movie/9004")).toHaveLength(2);
  });

  it("does not store listings whose genres could not be resolved", async () => {
    const { client, callsTo } = cachedClient({
      "/search/movie": () => jsonResponse(ambiguousSearch),
      "/genre/movie/list": () => jsonResponse({}, 503)
    });

    await client.searchMovies({ query: "La casa" });
    await client.searchMovies({ query: "La casa" });

    expect(callsTo("/search/movie")).toHaveLength(2);
  });

  it("deduplicates concurrent identical requests", async () => {
    const { client, callsTo } = cachedClient({ "/movie/9001": () => jsonResponse(completeDetails) });

    await Promise.all([client.getMovieDetails(9001), client.getMovieDetails(9001), client.getMovieDetails(9001)]);

    expect(callsTo("/movie/9001")).toHaveLength(1);
  });

  it("caches external ids and the genre catalog across instances", async () => {
    const store = new InMemoryCacheStore();
    const routes = { "/movie/7/external_ids": () => jsonResponse({ imdb_id: "tt7777777" }) };
    const first = cachedClient(routes, store);
    const second = cachedClient(routes, store);

    await first.client.getExternalIds(7);
    await first.client.getGenres();
    await second.client.getExternalIds(7);
    await second.client.getGenres();

    expect(second.calls).toHaveLength(0);
  });

  it("keeps working when the cache store fails", async () => {
    const errors: string[] = [];
    const fake = createFakeFetch({ "/movie/9001": () => jsonResponse(completeDetails) });
    const client = new TmdbClient({
      accessToken: TOKEN,
      fetch: fake.fetch,
      cache: {
        store: {
          get: () => Promise.reject(new Error("down")),
          set: () => Promise.reject(new Error("down")),
          delete: () => Promise.resolve(),
          deleteByPrefix: () => Promise.resolve(0)
        },
        onStoreError: (_error, operation) => errors.push(operation)
      }
    });

    expect((await client.getMovieDetails(9001)).id).toBe(9001);
    expect(errors).toEqual(["get", "set"]);
  });
});

describe("TmdbClient quota integration", () => {
  function quota(limit: number, store: QuotaStore = new InMemoryQuotaStore()) {
    return new QuotaManager({
      store,
      policies: { [TMDB_QUOTA_PROVIDER]: { windows: [{ limit, windowMs: 60_000 }] } }
    });
  }

  function guardedClient(manager: QuotaManager, routes: Record<string, Route>) {
    const fake = createFakeFetch({ "/genre/movie/list": () => jsonResponse(genreList), ...routes });
    const client = new TmdbClient({
      accessToken: TOKEN,
      fetch: createResilientFetch({
        provider: TMDB_QUOTA_PROVIDER,
        quota: manager,
        fetch: fake.fetch,
        retry: { sleep: () => Promise.resolve() }
      })
    });
    return { client, ...fake };
  }

  it("counts retries as external requests", async () => {
    const manager = quota(10);
    let attempts = 0;
    const { client } = guardedClient(manager, {
      "/movie/9001": () => {
        attempts += 1;
        return attempts < 3 ? jsonResponse({}, 503) : jsonResponse(completeDetails);
      }
    });

    expect((await client.getMovieDetails(9001)).id).toBe(9001);
    expect((await manager.usage(TMDB_QUOTA_PROVIDER)).windows[0]?.used).toBe(3);
  });

  it("reports an exhausted quota without contacting TMDB", async () => {
    const manager = quota(1);
    const { client, calls } = guardedClient(manager, { "/movie/9001": () => jsonResponse(completeDetails) });

    await client.getMovieDetails(9001);
    const error = await client.getMovieDetails(9001).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "quota_exhausted", retryable: false });
    expect((error as TmdbError).retryAfterMs).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it("reports an unavailable quota store without contacting TMDB", async () => {
    const broken: QuotaStore = {
      tryAcquire: () => Promise.reject(new Error("redis down")),
      release: () => Promise.resolve(),
      usage: () => Promise.reject(new Error("redis down"))
    };
    const { client, calls } = guardedClient(quota(5, broken), { "/movie/9001": () => jsonResponse(completeDetails) });

    expect(await client.getMovieDetails(9001).catch((caught: unknown) => caught)).toMatchObject({
      code: "quota_unavailable"
    });
    expect(calls).toHaveLength(0);
  });

  it("does not consume quota for cached results", async () => {
    const manager = quota(5);
    const fake = createFakeFetch({ "/movie/9001": () => jsonResponse(completeDetails) });
    const client = new TmdbClient({
      accessToken: TOKEN,
      fetch: createResilientFetch({ provider: TMDB_QUOTA_PROVIDER, quota: manager, fetch: fake.fetch }),
      cache: { store: new InMemoryCacheStore() }
    });

    await client.getMovieDetails(9001);
    await client.getMovieDetails(9001);

    expect((await manager.usage(TMDB_QUOTA_PROVIDER)).windows[0]?.used).toBe(1);
  });
});
