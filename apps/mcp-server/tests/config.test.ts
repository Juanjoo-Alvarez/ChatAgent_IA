import { describe, expect, it } from "vitest";

import { ConfigError, createJsonLogger, loadConfig, toErrorPayload } from "../src/index.js";

const base = { TMDB_READ_ACCESS_TOKEN: "token", QUOTA_TMDB: "10/1s", REDIS_URL: "redis://localhost:6379" };

describe("loadConfig", () => {
  it("applies defaults for the transport and requires Redis by default", () => {
    expect(loadConfig(base)).toMatchObject({
      host: "127.0.0.1",
      port: 8001,
      path: "/mcp",
      allowedHosts: [],
      sharedStore: "redis",
      redisUrl: "redis://localhost:6379",
      tmdb: { accessToken: "token", language: undefined, timeoutMs: undefined },
      quotaPolicies: { tmdb: { windows: [{ limit: 10, windowMs: 1000 }] } }
    });
  });

  it("reads optional settings", () => {
    const config = loadConfig({
      ...base,
      MCP_HOST: "0.0.0.0",
      MCP_PORT: "9000",
      MCP_PATH: "/tools",
      MCP_ALLOWED_HOSTS: "mcp.local:9000, localhost:9000 ,",
      TMDB_LANGUAGE: "es-ES",
      TMDB_TIMEOUT_MS: "5000",
      SHARED_STORE: "memory"
    });

    expect(config).toMatchObject({
      host: "0.0.0.0",
      port: 9000,
      path: "/tools",
      allowedHosts: ["mcp.local:9000", "localhost:9000"],
      tmdb: { language: "es-ES", timeoutMs: 5000 },
      sharedStore: "memory",
      redisUrl: null
    });
  });

  it.each([
    [{ ...base, TMDB_READ_ACCESS_TOKEN: " " }, /TMDB_READ_ACCESS_TOKEN/],
    [{ ...base, QUOTA_TMDB: undefined }, /QUOTA_TMDB/],
    [{ ...base, QUOTA_TMDB: "many" }, /Invalid quota window/],
    [{ ...base, REDIS_URL: undefined }, /REDIS_URL/],
    [{ ...base, SHARED_STORE: "disk" }, /SHARED_STORE/],
    [{ ...base, MCP_PORT: "http" }, /MCP_PORT/],
    [{ ...base, TMDB_TIMEOUT_MS: "-1" }, /TMDB_TIMEOUT_MS/],
    [{ ...base, MCP_PATH: "mcp" }, /MCP_PATH/]
  ])("rejects invalid configuration %#", (env, message) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(message);
  });
});

describe("createJsonLogger", () => {
  it("writes one JSON line per event", () => {
    const lines: string[] = [];
    const logger = createJsonLogger((line) => lines.push(line));

    logger.info("started", { port: 1 });
    logger.error("failed");

    expect(lines.map((line) => JSON.parse(line) as Record<string, unknown>)).toMatchObject([
      { level: "info", event: "started", port: 1 },
      { level: "error", event: "failed" }
    ]);
  });
});

describe("toErrorPayload", () => {
  it("treats non-Error values as internal errors", () => {
    expect(toErrorPayload("boom").error.code).toBe("internal_error");
  });
});
