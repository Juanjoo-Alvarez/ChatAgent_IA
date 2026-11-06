import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  QuotaExceededError,
  QuotaManager,
  RedisCacheStore,
  RedisQuotaStore,
  type ProviderQuotaPolicy
} from "../src";

// Pruebas contra un Redis real. Se ejecutan solo si existe REDIS_URL, por
// ejemplo con `docker compose up -d redis` y REDIS_URL=redis://localhost:6379.
const REDIS_URL = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .REDIS_URL;
const suite = REDIS_URL === undefined || REDIS_URL === "" ? describe.skip : describe;

suite("Redis integration", () => {
  const prefix = `agichat:test:${crypto.randomUUID()}`;
  const replicas: Redis[] = [];

  /** Cada réplica tiene su propia conexión y su propio QuotaManager. */
  function replica(policies: Record<string, ProviderQuotaPolicy>): QuotaManager {
    const connection = new Redis(REDIS_URL ?? "", { lazyConnect: false, maxRetriesPerRequest: 1 });
    replicas.push(connection);
    return new QuotaManager({ store: new RedisQuotaStore(connection, { keyPrefix: `${prefix}:quota` }), policies });
  }

  beforeAll(async () => {
    const probe = new Redis(REDIS_URL ?? "");
    replicas.push(probe);
    await probe.ping();
  });

  afterAll(async () => {
    const [first] = replicas;
    if (first !== undefined) {
      const cache = new RedisCacheStore(first, { keyPrefix: prefix });
      await cache.deleteByPrefix("");
    }
    await Promise.all(replicas.map((connection) => connection.quit()));
  });

  it("enforces one shared limit across concurrent replicas", async () => {
    const policies = { tmdb: { windows: [{ limit: 10, windowMs: 60_000 }] } };
    const managers = [replica(policies), replica(policies), replica(policies)];

    const attempts = Array.from({ length: 45 }, (_, index) =>
      (managers[index % managers.length] as QuotaManager).acquire("tmdb").then(
        () => "allowed" as const,
        (error: unknown) => (error instanceof QuotaExceededError ? ("rejected" as const) : Promise.reject(error))
      )
    );
    const outcomes = await Promise.all(attempts);

    expect(outcomes.filter((outcome) => outcome === "allowed")).toHaveLength(10);
    expect(outcomes.filter((outcome) => outcome === "rejected")).toHaveLength(35);
    expect((await (managers[0] as QuotaManager).usage("tmdb")).windows[0]).toMatchObject({ used: 10, remaining: 0 });
  });

  it("keeps independent counters per provider and releases unsent requests", async () => {
    const policies = {
      tmdb_isolated: { windows: [{ limit: 1, windowMs: 60_000 }] },
      google_books: { windows: [{ limit: 1, windowMs: 60_000 }] }
    };
    const [a, b] = [replica(policies), replica(policies)];

    const lease = await a.acquire("tmdb_isolated");
    await expect(b.acquire("tmdb_isolated")).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(b.acquire("google_books")).resolves.toBeDefined();

    await lease.release();
    await expect(b.acquire("tmdb_isolated")).resolves.toBeDefined();
  });

  it("frees capacity when the sliding window passes", async () => {
    const manager = replica({ short: { windows: [{ limit: 1, windowMs: 200 }] } });

    await manager.acquire("short");
    const error = await manager.acquire("short").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect((error as QuotaExceededError).retryAfterMs).toBeLessThanOrEqual(200);

    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(manager.acquire("short")).resolves.toBeDefined();
  });

  it("shares cached values across replicas with TTL", async () => {
    const [first, second] = [new Redis(REDIS_URL ?? ""), new Redis(REDIS_URL ?? "")];
    replicas.push(first, second);
    const writer = new RedisCacheStore(first, { keyPrefix: prefix });
    const reader = new RedisCacheStore(second, { keyPrefix: prefix });

    await writer.set("tmdb:v1:details:{\"id\":1}", '{"id":1}', 150);
    expect(await reader.get("tmdb:v1:details:{\"id\":1}")).toBe('{"id":1}');

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await reader.get("tmdb:v1:details:{\"id\":1}")).toBeNull();

    await writer.set("tmdb:v1:a", "1", 10_000);
    await writer.set("tmdb:v1:b", "2", 10_000);
    expect(await reader.deleteByPrefix("tmdb:v1:")).toBe(2);
  });
});
