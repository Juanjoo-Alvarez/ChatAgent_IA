import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createApplication, loadConfig, silentLogger, type Application, type RedisConnection } from "../src/index.js";
import { fakeTmdb } from "./fixtures.js";

// Pruebas de extremo a extremo: un servidor HTTP real y un cliente MCP del SDK
// oficial que se conecta igual que lo haría cualquier cliente externo.

const running: Application[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(running.splice(0).map((app) => app.stop()));
});

async function startServer(env: Record<string, string> = {}, tmdb = fakeTmdb()) {
  const config = loadConfig({
    TMDB_READ_ACCESS_TOKEN: "test-token",
    QUOTA_TMDB: "100/1m",
    SHARED_STORE: "memory",
    MCP_PORT: "1",
    ...env
  });
  const app = createApplication({ ...config, port: 0 }, { logger: silentLogger, fetch: tmdb.fetch });
  running.push(app);
  const address: AddressInfo = await app.start();
  return { app, tmdb, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function connectClient(baseUrl: string, path = "/mcp"): Promise<Client> {
  const client = new Client({ name: "external-client", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}${path}`)));
  clients.push(client);
  return client;
}

describe("Streamable HTTP transport", () => {
  it("serves the movie tools to an external MCP client", async () => {
    const { baseUrl } = await startServer();
    const client = await connectClient(baseUrl);

    expect(client.getServerVersion()).toMatchObject({ name: "agichat-tools" });
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
      "get_movie_details",
      "recommend_movies",
      "search_movies"
    ]);

    const search = (await client.callTool({ name: "search_movies", arguments: { query: "Marea alta" } })) as CallToolResult;
    const details = (await client.callTool({ name: "get_movie_details", arguments: { movie_id: 501 } })) as CallToolResult;
    const candidates = (await client.callTool({
      name: "recommend_movies",
      arguments: { genres: ["Drama"] }
    })) as CallToolResult;

    expect(search.structuredContent).toMatchObject({ total_results: 2 });
    expect(details.structuredContent).toMatchObject({ movie: { imdb_id: "tt9950101" } });
    expect(candidates.structuredContent).toMatchObject({ kind: "candidates" });
  });

  it("reuses cached TMDB results between independent requests", async () => {
    const { baseUrl, tmdb } = await startServer();
    const first = await connectClient(baseUrl);
    const second = await connectClient(baseUrl);

    await first.callTool({ name: "get_movie_details", arguments: { movie_id: 501 } });
    await second.callTool({ name: "get_movie_details", arguments: { movie_id: 501 } });

    expect(tmdb.paths.filter((path) => path === "/movie/501")).toHaveLength(1);
  });

  it("answers with a quota error once the configured limit is reached", async () => {
    const { baseUrl, app } = await startServer({ QUOTA_TMDB: "1/1m" });
    const client = await connectClient(baseUrl);

    await client.callTool({ name: "get_movie_details", arguments: { movie_id: 501 } });
    const blocked = (await client.callTool({ name: "get_movie_details", arguments: { movie_id: 777 } })) as CallToolResult;

    expect(blocked.isError).toBe(true);
    const [content] = blocked.content;
    expect(content?.type === "text" && JSON.parse(content.text)).toMatchObject({
      error: { code: "quota_exhausted", retryable: false }
    });
    expect((await app.quota.usage("tmdb")).windows[0]).toMatchObject({ used: 1, remaining: 0 });
  });

  it("honours a custom MCP path", async () => {
    const { baseUrl } = await startServer({ MCP_PATH: "/tools" });

    const client = await connectClient(baseUrl, "/tools");

    expect((await client.listTools()).tools).toHaveLength(3);
  });

  it("rejects GET and DELETE because the server is stateless", async () => {
    const { baseUrl } = await startServer();

    const get = await fetch(`${baseUrl}/mcp`, { headers: { Accept: "text/event-stream" } });
    const remove = await fetch(`${baseUrl}/mcp`, { method: "DELETE" });

    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect(remove.status).toBe(405);
  });

  it("exposes a health check and 404 for unknown paths", async () => {
    const { baseUrl } = await startServer();

    expect(await (await fetch(`${baseUrl}/healthz`)).json()).toEqual({ status: "ok" });
    expect((await fetch(`${baseUrl}/healthz`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${baseUrl}/other`)).status).toBe(404);
  });

  it("returns JSON-RPC errors for malformed requests", async () => {
    const { baseUrl } = await startServer();

    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: "{not json"
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32700 } });
  });

  it("rejects unexpected Host headers when allowed hosts are configured", async () => {
    const { baseUrl } = await startServer({ MCP_ALLOWED_HOSTS: "mcp.internal" });

    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    });

    expect(response.status).toBe(403);
  });
});

describe("application composition", () => {
  it("uses Redis-backed stores and closes the connection on stop", async () => {
    let quitCalls = 0;
    const redis: RedisConnection = {
      eval: () => Promise.resolve([1, 0, 1]),
      get: () => Promise.resolve(null),
      set: () => Promise.resolve("OK"),
      del: () => Promise.resolve(0),
      scan: () => Promise.resolve(["0", []]),
      quit: () => {
        quitCalls += 1;
        return Promise.resolve("OK");
      }
    };
    const config = loadConfig({ TMDB_READ_ACCESS_TOKEN: "t", QUOTA_TMDB: "5/1s", REDIS_URL: "redis://example:6379" });
    const urls: string[] = [];
    const app = createApplication({ ...config, port: 0 }, {
      logger: silentLogger,
      fetch: fakeTmdb().fetch,
      connectRedis: (url) => {
        urls.push(url);
        return redis;
      }
    });

    await app.start();
    expect(await app.quota.acquire("tmdb")).toMatchObject({ provider: "tmdb" });
    await app.stop();

    expect(urls).toEqual(["redis://example:6379"]);
    expect(quitCalls).toBe(1);
  });

  it("requires a Redis connector when the shared store is Redis", () => {
    const config = loadConfig({ TMDB_READ_ACCESS_TOKEN: "t", QUOTA_TMDB: "5/1s", REDIS_URL: "redis://x" });

    expect(() => createApplication(config, { logger: silentLogger })).toThrow(/Redis connection is required/);
  });

  it("reports when the port is already in use", async () => {
    const { baseUrl } = await startServer();
    const port = Number(new URL(baseUrl).port);
    const config = loadConfig({ TMDB_READ_ACCESS_TOKEN: "t", QUOTA_TMDB: "5/1s", SHARED_STORE: "memory" });
    const clash = createApplication({ ...config, port }, { logger: silentLogger });

    await expect(clash.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});
