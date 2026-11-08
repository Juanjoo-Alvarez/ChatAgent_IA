import { describe, expect, it, vi } from "vitest";

import { RedisSessionStore } from "../src/RedisSessionStore.js";
import { InMemorySessionStore, type SavedTurn } from "../src/sessions.js";
import { turn } from "./sessionFixture.js";
describe("bounded in-memory sessions", () => {
  it("isolates snapshots and requires a valid owner and live lease to commit", async () => {
    let time = 0;
    const store = new InMemorySessionStore(() => time);
    expect(await store.get("absent")).toBeNull();
    expect(await store.acquire("absent", "hash", "a", 10)).toBe(false);
    expect(await store.commit("absent", "a", turn, 100)).toBe(false);
    await store.create("session", "hash", 100);
    expect(await store.acquire("session", "bad", "a", 10)).toBe(false);
    expect(await store.acquire("session", "hash", "a", 10)).toBe(true);
    expect(await store.acquire("session", "hash", "b", 10)).toBe(false);
    expect(await store.commit("session", "b", turn, 100)).toBe(false);
    await store.release("session", "b");
    expect(await store.commit("session", "a", turn, 100)).toBe(true);
    const snapshot = await store.get("session");
    (snapshot?.turns as SavedTurn[]).splice(0);
    expect((await store.get("session"))?.turns).toHaveLength(1);
    time = 11;
    expect(await store.commit("session", "a", turn, 100)).toBe(false);
    expect(await store.acquire("session", "hash", "b", 10)).toBe(true);
    await store.release("session", "b");
    expect(await store.acquire("session", "hash", "c", 10)).toBe(true);
    time = 101;
    expect(await store.get("session")).toBeNull();
    await store.release("absent", "a");
  });
  it("evicts expired entries, enforces capacity and bounds history", async () => {
    let time = 0;
    const store = new InMemorySessionStore(() => time, 1);
    await store.create("a", "hash", 10);
    await expect(store.create("b", "hash", 10)).rejects.toThrow("session_capacity");
    time = 11;
    await store.create("b", "hash", 100);
    await store.acquire("b", "hash", "owner", 50);
    for (let i = 0; i < 25; i += 1) { await store.commit("b", "owner", { ...turn, requestId: String(i) }, 100); }
    expect((await store.get("b"))?.turns).toHaveLength(20);
    expect((await store.get("b"))?.turns[0]?.requestId).toBe("5");
  });
});
describe("Redis session adapter failure handling", () => {
  it("uses distinct atomic commands and normalizes Lua's empty array representation", async () => {
    const redis = { eval: vi.fn().mockResolvedValue("OK"), get: vi.fn().mockResolvedValue(null) };
    const store = new RedisSessionStore(redis, "test");
    await store.create("id", "hash", 100);
    expect(await store.get("id")).toBeNull();
    redis.get.mockResolvedValue(JSON.stringify({ tokenHash: "hash", turns: {} }));
    expect(await store.get("id")).toEqual({ tokenHash: "hash", turns: [] });
    redis.get.mockResolvedValue(JSON.stringify({ tokenHash: "hash", turns: [turn] }));
    expect((await store.get("id"))?.turns).toEqual([turn]);
    // Redis guarda cada turno como JSON opaco para no convertir arrays vacíos en objetos.
    redis.get.mockResolvedValue(JSON.stringify({ tokenHash: "hash", turns: [JSON.stringify(turn)] }));
    expect((await store.get("id"))?.turns).toEqual([turn]);
    expect((await store.get("id"))?.turns[0]?.frame.references).toEqual([]);
    expect((await store.get("id"))?.turns[0]?.frame.actions).toEqual([]);
    redis.eval.mockResolvedValue(1);
    expect(await store.acquire("id", "hash", "owner", 50)).toBe(true);
    expect(await store.commit("id", "owner", turn, 100)).toBe(true);
    await store.release("id", "owner");
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 2, "test:{id}", "test:{id}:lock", "hash", "owner", 50);
    redis.eval.mockResolvedValue(0);
    expect(await store.acquire("id", "hash", "other", 50)).toBe(false);
    expect(await store.commit("id", "other", turn, 100)).toBe(false);
    await expect(store.create("id", "hash", 100)).rejects.toThrow("session_not_created");
  });
});
