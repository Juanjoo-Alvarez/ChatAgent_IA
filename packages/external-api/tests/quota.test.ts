import { describe, expect, it } from "vitest";

import {
  InMemoryQuotaStore,
  QuotaConfigurationError,
  QuotaExceededError,
  QuotaManager,
  QuotaUnavailableError,
  parseQuotaWindows,
  quotaEnvVariable,
  quotaPoliciesFromEnv,
  type QuotaEvent,
  type QuotaStore
} from "../src";

function clock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    }
  };
}

function manager(policies: ConstructorParameters<typeof QuotaManager>[0]["policies"], store: QuotaStore = new InMemoryQuotaStore()) {
  const events: QuotaEvent[] = [];
  let next = 0;
  const quota = new QuotaManager({
    store,
    policies,
    createLeaseId: () => `lease-${++next}`,
    onEvent: (event) => events.push(event)
  });
  return { quota, events };
}

describe("InMemoryQuotaStore", () => {
  it("allows requests up to the limit and reports when capacity returns", async () => {
    const time = clock();
    const store = new InMemoryQuotaStore({ now: time.now });
    const windows = [{ limit: 2, windowMs: 1000 }];

    expect((await store.tryAcquire("tmdb", windows, "a")).allowed).toBe(true);
    time.advance(300);
    expect((await store.tryAcquire("tmdb", windows, "b")).windows[0]).toMatchObject({ used: 2, remaining: 0 });

    const rejected = await store.tryAcquire("tmdb", windows, "c");
    expect(rejected).toMatchObject({ allowed: false, retryAfterMs: 700 });

    time.advance(700);
    expect((await store.tryAcquire("tmdb", windows, "d")).allowed).toBe(true);
  });

  it("applies every window atomically", async () => {
    const store = new InMemoryQuotaStore({ now: clock().now });
    const windows = [
      { limit: 5, windowMs: 1000 },
      { limit: 1, windowMs: 60_000 }
    ];

    await store.tryAcquire("p", windows, "a");
    const rejected = await store.tryAcquire("p", windows, "b");

    expect(rejected.allowed).toBe(false);
    // El rechazo de la ventana diaria no consume cupo de la ventana corta.
    expect(rejected.windows.map((window) => window.used)).toEqual([1, 1]);
  });

  it("releases a lease and reports usage", async () => {
    const store = new InMemoryQuotaStore({ now: clock().now });
    const windows = [{ limit: 1, windowMs: 1000 }];

    await store.tryAcquire("p", windows, "a");
    await store.release("p", windows, "a");
    await store.release("other", windows, "a");

    expect(await store.usage("p", windows)).toEqual([{ limit: 1, windowMs: 1000, used: 0, remaining: 1 }]);
  });
});

describe("QuotaManager", () => {
  it("keeps independent counters per provider", async () => {
    const { quota } = manager({
      tmdb: { windows: [{ limit: 1, windowMs: 60_000 }] },
      google_books: { windows: [{ limit: 1, windowMs: 60_000 }] }
    });

    await quota.acquire("tmdb");

    await expect(quota.acquire("tmdb")).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(quota.acquire("google_books")).resolves.toMatchObject({ provider: "google_books" });
    expect(quota.providers).toEqual(["tmdb", "google_books"]);
  });

  it("does not count rejected attempts", async () => {
    const { quota, events } = manager({ tmdb: { windows: [{ limit: 1, windowMs: 60_000 }] } });

    await quota.acquire("tmdb");
    const error = await quota.acquire("tmdb").catch((caught: unknown) => caught);

    expect(error).toMatchObject({ provider: "tmdb", name: "QuotaExceededError" });
    expect((error as QuotaExceededError).retryAfterMs).toBeGreaterThan(0);
    expect((await quota.usage("tmdb")).windows[0]?.used).toBe(1);
    expect(events.map((event) => event.type)).toEqual(["acquired", "rejected"]);
  });

  it("releases a lease only once", async () => {
    const { quota, events } = manager({ tmdb: { windows: [{ limit: 1, windowMs: 60_000 }] } });

    const lease = await quota.acquire("tmdb");
    await lease.release();
    await lease.release();

    expect(await quota.usage("tmdb")).toMatchObject({ available: true });
    expect(events.filter((event) => event.type === "released")).toHaveLength(1);
  });

  it("fails closed when the store is unavailable", async () => {
    const broken: QuotaStore = {
      tryAcquire: () => Promise.reject(new Error("ECONNREFUSED")),
      release: () => Promise.reject(new Error("down")),
      usage: () => Promise.reject(new Error("down"))
    };
    const { quota, events } = manager({ tmdb: { windows: [{ limit: 1, windowMs: 1000 }] } }, broken);

    await expect(quota.acquire("tmdb")).rejects.toBeInstanceOf(QuotaUnavailableError);
    await expect(quota.usage("tmdb")).rejects.toBeInstanceOf(QuotaUnavailableError);
    expect(events[0]).toMatchObject({ type: "store_error", provider: "tmdb" });
  });

  it("rejects unknown providers", async () => {
    const { quota } = manager({ tmdb: { windows: [{ limit: 1, windowMs: 1000 }] } });

    await expect(quota.acquire("google_books")).rejects.toBeInstanceOf(QuotaConfigurationError);
  });

  it.each([
    [{ "Bad Name": { windows: [{ limit: 1, windowMs: 1 }] } }],
    [{ tmdb: { windows: [] } }],
    [{ tmdb: { windows: [{ limit: 0, windowMs: 1000 }] } }],
    [{ tmdb: { windows: [{ limit: 1.5, windowMs: 1000 }] } }],
    [{ tmdb: { windows: [{ limit: 1, windowMs: 0 }] } }],
    [{ tmdb: { windows: [{ limit: 1, windowMs: 1000 }, { limit: 2, windowMs: 1000 }] } }]
  ])("validates policies %#", (policies) => {
    expect(() => new QuotaManager({ store: new InMemoryQuotaStore(), policies })).toThrow(QuotaConfigurationError);
  });

  it("generates unique lease ids by default", async () => {
    const quota = new QuotaManager({
      store: new InMemoryQuotaStore(),
      policies: { tmdb: { windows: [{ limit: 5, windowMs: 1000 }] } }
    });

    const first = await quota.acquire("tmdb");
    const second = await quota.acquire("tmdb");

    expect(first.id).not.toBe(second.id);
  });
});

describe("quota configuration", () => {
  it("parses windows with units", () => {
    expect(parseQuotaWindows("40/10s, 10000/1d,5/250ms,2/1m,3/2h")).toEqual([
      { limit: 40, windowMs: 10_000 },
      { limit: 10000, windowMs: 86_400_000 },
      { limit: 5, windowMs: 250 },
      { limit: 2, windowMs: 60_000 },
      { limit: 3, windowMs: 7_200_000 }
    ]);
  });

  it("rejects malformed definitions", () => {
    expect(() => parseQuotaWindows(" , ")).toThrow(QuotaConfigurationError);
    expect(() => parseQuotaWindows("40 per second")).toThrow(/expected <limit>/);
  });

  it("reads one variable per provider and has no implicit defaults", () => {
    expect(quotaEnvVariable("google-books")).toBe("QUOTA_GOOGLE_BOOKS");
    expect(quotaPoliciesFromEnv({ QUOTA_TMDB: "20/1s" }, ["tmdb"])).toEqual({
      tmdb: { windows: [{ limit: 20, windowMs: 1000 }] }
    });
    expect(() => quotaPoliciesFromEnv({ QUOTA_TMDB: "20/1s" }, ["tmdb", "google_books"])).toThrow(
      "Missing quota configuration: set QUOTA_GOOGLE_BOOKS"
    );
    expect(() => quotaPoliciesFromEnv({ QUOTA_TMDB: " " }, ["tmdb"])).toThrow(QuotaConfigurationError);
  });
});
