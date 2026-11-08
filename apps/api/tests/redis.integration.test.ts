import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";
import { describe, expect, it } from "vitest";

import { RedisSessionStore } from "../src/RedisSessionStore.js";
import { createApi } from "../src/app.js";
import { loadApiConfig } from "../src/config.js";
import { authenticated, connected, message, origin } from "./helpers.js";
import { turn } from "./sessionFixture.js";

const redisUrl = process.env.REDIS_URL;
describe.skipIf(!redisUrl)("real Redis session leases across replicas", () => {
  it("restores an authenticated conversation through a second composed API replica", async () => {
    const config = { ...loadApiConfig({ AGENT_MODE: "fixture", TOOLS_MODE: "fixture", SESSION_STORE: "redis", REDIS_URL: redisUrl }), port: 0 };
    const apps = [createApi(config), createApi(config)];
    let sessionId: string | undefined;
    const cleanup = new Redis(redisUrl as string);
    try {
      const [a, b] = await Promise.all(apps.map((app) => app.start()));
      const baseA = `http://127.0.0.1:${a?.port}`;
      const baseB = `http://127.0.0.1:${b?.port}`;
      const response = await fetch(`${baseA}/sessions`, { method: "POST", headers: { Origin: origin } });
      const credentials = await response.json() as { version: 1; sessionId: string; token: string; expiresInSeconds: number; websocketPath: "/chat" };
      sessionId = credentials.sessionId;
      const first = await authenticated(baseA, credentials);
      const request = message(); first.send(request);
      const saved = await first.next("agent-message");
      first.ws.terminate();
      const second = await authenticated(baseB, credentials);
      second.send(request);
      expect(await second.next("agent-message")).toEqual(saved);
    } finally {
      connected.splice(0).forEach((ws) => ws.terminate());
      await Promise.all(apps.map((app) => app.stop()));
      if (sessionId !== undefined) { await cleanup.del(`agichat:chat:{${sessionId}}`, `agichat:chat:{${sessionId}}:lock`); }
      await cleanup.quit();
    }
  });
  it("allows exactly one concurrent owner and rejects stale commits", async () => {
    const connections = [new Redis(redisUrl as string), new Redis(redisUrl as string)];
    const id = randomUUID();
    const prefix = `agichat:test:${randomUUID()}`;
    const [a, b] = connections.map((connection) => new RedisSessionStore(connection, prefix)) as [RedisSessionStore, RedisSessionStore];
    try {
      await a.create(id, "hash", 10000);
      const outcomes = await Promise.all([a.acquire(id, "hash", "owner-a", 1000), b.acquire(id, "hash", "owner-b", 1000)]);
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      const owner = outcomes[0] ? "owner-a" : "owner-b";
      expect(await b.commit(id, "intruder", turn, 10000)).toBe(false);
      expect(await a.commit(id, owner, turn, 10000)).toBe(true);
      expect((await b.get(id))?.turns).toHaveLength(1);
      await b.release(id, "intruder");
      expect(await b.acquire(id, "hash", "next", 1000)).toBe(false);
      await a.release(id, owner);
      expect(await b.acquire(id, "hash", "next", 1000)).toBe(true);
      expect(await a.commit(id, owner, turn, 10000)).toBe(false);
    } finally {
      await connections[0]?.del(`${prefix}:{${id}}`, `${prefix}:{${id}}:lock`);
      await Promise.all(connections.map((connection) => connection.quit()));
    }
  });
});
