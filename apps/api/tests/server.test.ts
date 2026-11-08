import { randomUUID } from "node:crypto";

import { AgentError } from "@agichat/agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { InMemorySessionStore } from "../src/sessions.js";
import { authenticated, connected, fakeAgent, message, origin, reply, running, socket, start } from "./helpers.js";

afterEach(async () => {
  connected.splice(0).forEach((ws) => ws.terminate());
  await Promise.all(running.splice(0).map((app) => app.stop()));
});

describe("HTTP sessions and upgrade security", () => {
  it("creates opaque credentials, serves health and enforces exact CORS", async () => {
    const api = await start();
    const credentials = await api.credentials();
    expect(credentials.token).toHaveLength(43);
    expect(await api.store.get(credentials.sessionId)).toMatchObject({ tokenHash: expect.not.stringContaining(credentials.token), turns: [] });
    expect((await fetch(`${api.base}/healthz`)).status).toBe(200);
    expect((await fetch(`${api.base}/other`)).status).toBe(404);
    expect((await fetch(`${api.base}/sessions`, { method: "POST" })).status).toBe(403);
    expect((await fetch(`${api.base}/sessions`, { method: "POST", headers: { Origin: "https://evil.invalid" } })).status).toBe(403);
    const preflight = await fetch(`${api.base}/sessions`, { method: "OPTIONS", headers: { Origin: origin } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    expect((await fetch(`${api.base}/sessions`, { headers: { Origin: origin } })).status).toBe(405);
  });
  it("returns a redacted service error when sessions cannot be created", async () => {
    const store = new InMemorySessionStore();
    vi.spyOn(store, "create").mockRejectedValue(new Error("secret Redis address"));
    const api = await start(fakeAgent(), store);
    const response = await fetch(`${api.base}/sessions`, { method: "POST", headers: { Origin: origin } });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
  it.each(["/other", "/chat?token=forbidden"])("rejects unsupported upgrade route %s", async (path) => {
    const api = await start();
    const ws = new WebSocket(api.base.replace("http:", "ws:") + path, { origin });
    await expect(new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); })).rejects.toThrow();
  });
  it("rejects hostile origins and excess connections", async () => {
    const api = await start(fakeAgent(), undefined, { maxConnections: 1 });
    const ws = new WebSocket(api.base.replace("http:", "ws:") + "/chat", { origin: "https://evil.invalid" });
    await expect(new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); })).rejects.toThrow();
    await socket(api.base);
    await expect(socket(api.base)).rejects.toThrow();
  });
});

describe("authenticated conversation", () => {
  it("requires the issued token, not just a session identifier", async () => {
    const api = await start();
    const credentials = await api.credentials();
    const client = await socket(api.base);
    client.send(message());
    expect(await client.next("error")).toMatchObject({ code: "unauthorized" });
    client.send({ version: 1, type: "authenticate", sessionId: credentials.sessionId, token: "a".repeat(43) });
    expect(await client.next("error")).toMatchObject({ code: "unauthorized" });
    expect(api.agent.respond).not.toHaveBeenCalled();
  });
  it("validates frames and produces typing events around a response", async () => {
    const api = await start();
    const client = await authenticated(api.base, await api.credentials());
    client.ws.send("{invalid");
    expect(await client.next("error")).toMatchObject({ code: "invalid_frame" });
    client.ws.send(Buffer.from("binary"));
    expect(await client.next("error")).toMatchObject({ code: "invalid_frame" });
    client.send({ version: 1, type: "authenticate", sessionId: randomUUID(), token: "a".repeat(43) });
    expect(await client.next("error")).toMatchObject({ code: "unauthorized" });
    const request = message(); client.send(request);
    expect(await client.next("agent-typing")).toMatchObject({ isTyping: true });
    expect(await client.next("agent-message")).toMatchObject({ requestId: request.requestId, message: { content: reply.content } });
    expect(await client.next("agent-typing")).toMatchObject({ isTyping: false });
  });
  it("restores context after reconnection and replays recent requests without rerunning the agent", async () => {
    const api = await start();
    const credentials = await api.credentials();
    const first = await authenticated(api.base, credentials);
    const request = message(); first.send(request);
    const response = await first.next("agent-message");
    first.ws.terminate();
    const second = await authenticated(api.base, credentials);
    second.send(request);
    expect(await second.next("agent-message")).toEqual(response);
    expect(api.agent.respond).toHaveBeenCalledOnce();
    second.send({ ...request, content: "Otro contenido" });
    expect(await second.next("error")).toMatchObject({ code: "duplicate_request" });
    second.send(message("¿Y el libro?"));
    await second.next("agent-message");
    expect(api.agent.respond).toHaveBeenLastCalledWith(expect.objectContaining({ history: [expect.objectContaining({ user: request.content, assistant: reply.content })] }));
  });
  it("does not replay navigation side effects", async () => {
    const agent = fakeAgent();
    const reference = { provider: "imdb" as const, id: "tt1234567" };
    vi.mocked(agent.respond).mockResolvedValueOnce({ ...reply, references: [reference] }).mockResolvedValue({ ...reply, references: [reference], actions: [{ type: "open-reference", reference }] });
    const api = await start(agent);
    const client = await authenticated(api.base, await api.credentials());
    client.send(message()); await client.next("agent-message");
    const request = { ...message("Abre IMDb"), openReference: reference }; client.send(request);
    expect(await client.next("agent-message")).toMatchObject({ actions: [expect.anything()] });
    client.send(request);
    expect(await client.next("agent-message")).toMatchObject({ actions: [] });
  });
  it("blocks navigation without explicit user intent even if an agent proposes it", async () => {
    const agent = fakeAgent();
    vi.mocked(agent.respond).mockResolvedValue({ ...reply, actions: [{ type: "open-reference", reference: { provider: "imdb", id: "tt1234567" } }] });
    const api = await start(agent);
    const client = await authenticated(api.base, await api.credentials());
    client.send(message());
    expect(await client.next("error")).toMatchObject({ code: "policy_denied" });
  });
  it("keeps different sessions isolated", async () => {
    const api = await start();
    const a = await authenticated(api.base, await api.credentials());
    const b = await authenticated(api.base, await api.credentials());
    a.send(message("Mi preferencia privada")); await a.next("agent-message");
    b.send(message("Hola")); await b.next("agent-message");
    expect(api.agent.respond).toHaveBeenLastCalledWith(expect.objectContaining({ content: "Hola", history: [] }));
  });
  it("rejects parallel turns across two server replicas sharing a session store", async () => {
    const agent = fakeAgent();
    vi.mocked(agent.respond).mockImplementation(() => new Promise(() => undefined));
    const store = new InMemorySessionStore();
    const a = await start(agent, store);
    const b = await start(fakeAgent(), store);
    const credentials = await a.credentials();
    const first = await authenticated(a.base, credentials);
    const second = await authenticated(b.base, credentials);
    first.send(message()); await first.next("agent-typing");
    second.send(message());
    expect(await second.next("error")).toMatchObject({ code: "busy" });
    expect(b.agent.respond).not.toHaveBeenCalled();
  });
  it("cancels a turn, releases its lock and allows retry", async () => {
    const agent = fakeAgent();
    vi.mocked(agent.respond).mockImplementationOnce(() => new Promise(() => undefined));
    const api = await start(agent);
    const client = await authenticated(api.base, await api.credentials());
    const request = message(); client.send(request); await client.next("agent-typing");
    client.send(message()); expect(await client.next("error")).toMatchObject({ code: "busy" });
    client.send({ version: 1, type: "cancel", requestId: request.requestId });
    expect(await client.next("error")).toMatchObject({ code: "cancelled" });
    client.send(message()); await client.next("agent-message");
  });
  it("times out an unresponsive provider and does not persist its turn", async () => {
    const agent = fakeAgent();
    vi.mocked(agent.respond).mockImplementation(() => new Promise(() => undefined));
    const api = await start(agent, undefined, { turnTimeoutMs: 30 });
    const credentials = await api.credentials();
    const client = await authenticated(api.base, credentials);
    client.send(message());
    expect(await client.next("error")).toMatchObject({ code: "timeout" });
    expect((await api.store.get(credentials.sessionId))?.turns).toEqual([]);
  });
  it.each([new Error("secret-provider-key"), new AgentError("policy_denied")])("redacts internal errors and preserves public policy codes", async (cause) => {
    const agent = fakeAgent(); vi.mocked(agent.respond).mockRejectedValue(cause);
    const api = await start(agent);
    const client = await authenticated(api.base, await api.credentials());
    client.send(message());
    const error = await client.next("error");
    expect(error).toMatchObject({ code: cause instanceof AgentError ? "policy_denied" : "unavailable" });
    expect(JSON.stringify(error)).not.toContain("secret-provider-key");
  });
  it("rejects expired sessions during a conversation", async () => {
    let time = 0;
    const store = new InMemorySessionStore(() => time);
    const api = await start(fakeAgent(), store, { sessionTtlMs: 10 });
    const client = await authenticated(api.base, await api.credentials());
    time = 11;
    client.send(message());
    expect(await client.next("error")).toMatchObject({ code: "session_expired" });
  });
  it("handles authentication storage failures without exposing details", async () => {
    const store = new InMemorySessionStore();
    const api = await start(fakeAgent(), store);
    const credentials = await api.credentials();
    vi.spyOn(store, "get").mockRejectedValue(new Error("secret"));
    const client = await socket(api.base);
    client.send({ version: 1, type: "authenticate", sessionId: credentials.sessionId, token: credentials.token });
    expect(await client.next("error")).toMatchObject({ code: "unavailable" });
  });
});
