import { afterEach, describe, expect, it } from "vitest";

import { createApi } from "../src/app.js";
import { loadApiConfig } from "../src/config.js";
import { authenticated, connected, message } from "./helpers.js";

describe("API configuration", () => {
  it("uses a local model and a single-instance store by default", () => {
    expect(loadApiConfig({})).toMatchObject({ mode: "ollama", ollamaModel: "qwen3:4b", port: 8000, sessionStore: "memory" });
    expect(loadApiConfig({ SESSION_STORE: "redis", REDIS_URL: "redis://localhost:6379" }).sessionStore).toBe("redis");
  });
  it.each([
    { AGENT_MODE: "invalid" }, { TOOLS_MODE: "invalid" }, { TOOLS_MODE: "fixture" }, { SESSION_STORE: "invalid" }, { SESSION_STORE: "redis" },
    { CHAT_PORT: "0" }, { CHAT_PORT: "65536" }, { TURN_TIMEOUT_MS: "NaN" },
    { MCP_URL: "file:///secret" }, { MCP_URL: "https://user:pass@example.com/mcp" },
    { MCP_URL: "https://example.com/#fragment" }, { OLLAMA_URL: "invalid" },
    { CHAT_ALLOWED_ORIGINS: "*" }, { CHAT_ALLOWED_ORIGINS: "https://example.com/path" },
    { CHAT_ALLOWED_ORIGINS: "file:///" }, { CHAT_ALLOWED_ORIGINS: "" }, { OLLAMA_MODEL: " " }
  ])("rejects invalid configuration %j", (env) => {
    expect(() => loadApiConfig(env)).toThrow();
  });
});

const apps: ReturnType<typeof createApi>[] = [];
afterEach(async () => { connected.splice(0).forEach((ws) => ws.terminate()); await Promise.all(apps.splice(0).map((app) => app.stop())); });
describe("composition without external services", () => {
  it.each(["fixture", "ollama"])("starts in %s mode without calling providers before a request", async (mode) => {
    const app = createApi({ ...loadApiConfig({ AGENT_MODE: mode }), port: 0 });
    apps.push(app);
    const address = await app.start();
    expect((await fetch(`http://127.0.0.1:${address.port}/healthz`)).status).toBe(200);
  });
  it("reports a port conflict", async () => {
    const app = createApi({ ...loadApiConfig({}), port: 0 }); apps.push(app);
    const address = await app.start();
    const clash = createApi({ ...loadApiConfig({}), port: address.port });
    await expect(clash.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    await clash.stop();
  });
  it("runs an HTTP/WebSocket/agent turn entirely offline in explicit fixture mode", async () => {
    const app = createApi({ ...loadApiConfig({ AGENT_MODE: "fixture", TOOLS_MODE: "fixture" }), port: 0 }); apps.push(app);
    const address = await app.start();
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/sessions`, { method: "POST", headers: { Origin: "http://localhost:5173" } });
    const credentials = await response.json() as { version: 1; sessionId: string; token: string; expiresInSeconds: number; websocketPath: "/chat" };
    const client = await authenticated(base, credentials);
    client.send(message());
    expect(await client.next("agent-message")).toMatchObject({ message: { content: expect.stringContaining("sin LLM") }, movies: [{ title: "Película ficticia de integración" }] });
  });
});
