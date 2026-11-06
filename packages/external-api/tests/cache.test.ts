import { describe, expect, it, vi } from "vitest";

import {
  InMemoryCacheStore,
  ReadThroughCache,
  RedisCacheStore,
  RedisQuotaStore,
  buildCacheKey,
  canonicalJson,
  escapeRedisPattern,
  type CacheStore,
  type RedisLike
} from "../src";

function clock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("InMemoryCacheStore", () => {
  it("expires values after their TTL", async () => {
    const time = clock();
    const store = new InMemoryCacheStore({ now: time.now });

    await store.set("k", "v", 100);
    time.advance(99);
    expect(await store.get("k")).toBe("v");
    time.advance(1);
    expect(await store.get("k")).toBeNull();
    expect(store.size).toBe(0);
  });

  it("deletes keys individually and by prefix", async () => {
    const store = new InMemoryCacheStore();
    await store.set("tmdb:v1:a", "1", 1000);
    await store.set("tmdb:v1:b", "2", 1000);
    await store.set("books:v1:a", "3", 1000);

    await store.delete("tmdb:v1:a");
    expect(await store.deleteByPrefix("tmdb:")).toBe(1);
    expect(await store.get("books:v1:a")).toBe("3");
  });

  it("evicts the oldest entry when full", async () => {
    const store = new InMemoryCacheStore({ maxEntries: 2 });
    await store.set("a", "1", 1000);
    await store.set("b", "2", 1000);
    await store.set("a", "1b", 1000);
    await store.set("c", "3", 1000);

    expect(await store.get("b")).toBeNull();
    expect(await store.get("a")).toBe("1b");
  });
});

describe("ReadThroughCache", () => {
  it("reuses recent results and reloads after expiry", async () => {
    const time = clock();
    const cache = new ReadThroughCache(new InMemoryCacheStore({ now: time.now }));
    const load = vi.fn().mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 2 });

    expect(await cache.getOrLoad("k", load, { ttlMs: 50 })).toEqual({ n: 1 });
    expect(await cache.getOrLoad("k", load, { ttlMs: 50 })).toEqual({ n: 1 });
    time.advance(50);
    expect(await cache.getOrLoad("k", load, { ttlMs: 50 })).toEqual({ n: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never stores failures or rejected values", async () => {
    const cache = new ReadThroughCache(new InMemoryCacheStore());
    const failing = vi.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValue("ok");
    const degraded = vi.fn(() => Promise.resolve({ complete: false }));

    await expect(cache.getOrLoad("a", failing, { ttlMs: 1000 })).rejects.toThrow("503");
    expect(await cache.getOrLoad("a", failing, { ttlMs: 1000 })).toBe("ok");

    await cache.getOrLoad("b", degraded, { ttlMs: 1000, shouldCache: (value) => value.complete });
    await cache.getOrLoad("b", degraded, { ttlMs: 1000, shouldCache: (value) => value.complete });
    expect(degraded).toHaveBeenCalledTimes(2);
  });

  it("shares a single load among concurrent requests", async () => {
    const cache = new ReadThroughCache(new InMemoryCacheStore());
    let resolve: (value: string) => void = () => undefined;
    const gate = new Promise<string>((done) => (resolve = done));
    const load = vi.fn(() => gate);

    const first = cache.getOrLoad("k", load, { ttlMs: 1000 });
    const second = cache.getOrLoad("k", load, { ttlMs: 1000 });
    resolve("value");

    expect(await Promise.all([first, second])).toEqual(["value", "value"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps answering when the store fails", async () => {
    const errors: string[] = [];
    const broken: CacheStore = {
      get: () => Promise.reject(new Error("down")),
      set: () => Promise.reject(new Error("down")),
      delete: () => Promise.reject(new Error("down")),
      deleteByPrefix: () => Promise.resolve(0)
    };
    const cache = new ReadThroughCache(broken, { onStoreError: (_error, operation) => errors.push(operation) });

    expect(await cache.getOrLoad("k", () => Promise.resolve(1), { ttlMs: 10 })).toBe(1);
    await cache.invalidate("k");
    expect(await cache.invalidatePrefix("x")).toBe(0);
    expect(errors).toEqual(["get", "set", "delete"]);
  });

  it("discards corrupt entries and reloads", async () => {
    const store = new InMemoryCacheStore();
    await store.set("k", "{not json", 1000);
    const cache = new ReadThroughCache(store);

    expect(await cache.getOrLoad("k", () => Promise.resolve({ ok: true }), { ttlMs: 1000 })).toEqual({ ok: true });
    expect(await store.get("k")).toBe('{"ok":true}');
  });
});

describe("cache keys", () => {
  it("produce the same key for equivalent parameters", () => {
    expect(buildCacheKey("tmdb:v1", "search", { page: 1, query: "x", year: undefined })).toBe(
      buildCacheKey("tmdb:v1", "search", { query: "x", page: 1 })
    );
    expect(canonicalJson({ b: [2, undefined, { d: 1, c: 2 }], a: null })).toBe('{"a":null,"b":[2,null,{"c":2,"d":1}]}');
  });

  it("distinguish different parameters", () => {
    expect(buildCacheKey("tmdb:v1", "search", { query: "x", page: 1 })).not.toBe(
      buildCacheKey("tmdb:v1", "search", { query: "x", page: 2 })
    );
    expect(buildCacheKey("tmdb:v1", "search", { q: 1 })).not.toBe(buildCacheKey("tmdb:v1", "discover", { q: 1 }));
  });
});

/** Doble de Redis para validar la traducción de comandos sin servidor real. */
function fakeRedis(replies: unknown[] = []): RedisLike & { readonly commands: unknown[][]; readonly data: Map<string, string> } {
  const commands: unknown[][] = [];
  const data = new Map<string, string>();
  let scanStep = 0;
  return {
    commands,
    data,
    eval: (...args) => {
      commands.push(["eval", ...args.slice(1)]);
      return Promise.resolve(replies.shift());
    },
    get: (key) => Promise.resolve(data.get(key) ?? null),
    set: (key, value, ...rest) => {
      commands.push(["set", key, ...rest]);
      data.set(key, value);
      return Promise.resolve("OK");
    },
    del: (...keys) => {
      commands.push(["del", ...keys]);
      keys.forEach((key) => data.delete(key));
      return Promise.resolve(keys.length);
    },
    scan: (cursor, ...rest) => {
      commands.push(["scan", cursor, ...rest]);
      scanStep += 1;
      return Promise.resolve(scanStep === 1 ? ["7", ["p:a"]] : ["0", []]);
    }
  };
}

describe("RedisCacheStore", () => {
  it("prefixes keys and delegates expiration to Redis", async () => {
    const redis = fakeRedis();
    const store = new RedisCacheStore(redis, { keyPrefix: "p" });

    await store.set("a", "1", 1500.4);
    expect(await store.get("a")).toBe("1");
    await store.delete("a");

    expect(redis.commands).toEqual([
      ["set", "p:a", "PX", 1500],
      ["del", "p:a"]
    ]);
  });

  it("invalidates by literal prefix iterating SCAN", async () => {
    const redis = fakeRedis();
    const store = new RedisCacheStore(redis, { keyPrefix: "p" });

    expect(await store.deleteByPrefix('tmdb:v1:search:{"q":"*"}')).toBe(1);
    expect(redis.commands[0]).toEqual(["scan", "0", "MATCH", 'p:tmdb:v1:search:{"q":"\\*"}*', "COUNT", 200]);
    expect(redis.commands.at(-1)).toEqual(["scan", "7", "MATCH", 'p:tmdb:v1:search:{"q":"\\*"}*', "COUNT", 200]);
  });

  it("escapes every glob character", () => {
    expect(escapeRedisPattern("a*b?c[d]e\\")).toBe("a\\*b\\?c\\[d\\]e\\\\");
  });
});

describe("RedisQuotaStore", () => {
  const windows = [
    { limit: 3, windowMs: 1000 },
    { limit: 10, windowMs: 86_400_000 }
  ];

  it("sends one key per window and parses the script reply", async () => {
    const redis = fakeRedis([[1, 0, 1, 4], [0, 250, 3, 5], ["2", "6"]]);
    const store = new RedisQuotaStore(redis, { keyPrefix: "q" });

    expect(await store.tryAcquire("tmdb", windows, "lease")).toEqual({
      allowed: true,
      retryAfterMs: 0,
      windows: [
        { limit: 3, windowMs: 1000, used: 1, remaining: 2 },
        { limit: 10, windowMs: 86_400_000, used: 4, remaining: 6 }
      ]
    });
    expect(redis.commands[0]).toEqual(["eval", 2, "q:tmdb:1000", "q:tmdb:86400000", "lease", 3, 1000, 10, 86_400_000]);

    expect(await store.tryAcquire("tmdb", windows, "other")).toMatchObject({ allowed: false, retryAfterMs: 250 });
    expect((await store.usage("tmdb", windows)).map((window) => window.used)).toEqual([2, 6]);
  });

  it("releases leases on every window", async () => {
    const redis = fakeRedis([1]);
    await new RedisQuotaStore(redis).release("tmdb", windows, "lease");

    expect(redis.commands[0]).toEqual(["eval", 2, "agichat:quota:tmdb:1000", "agichat:quota:tmdb:86400000", "lease"]);
  });

  it("rejects unexpected replies", async () => {
    const store = new RedisQuotaStore(fakeRedis([[1, 0], [1, 0, "x", 1]]));

    await expect(store.tryAcquire("tmdb", windows, "a")).rejects.toThrow(TypeError);
    await expect(store.tryAcquire("tmdb", windows, "b")).rejects.toThrow(TypeError);
  });
});
