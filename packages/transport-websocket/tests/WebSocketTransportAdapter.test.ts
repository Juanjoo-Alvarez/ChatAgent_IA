import type { TransportEvent } from "@agichat/core";
import { CAPABILITY_NOTICE } from "@agichat/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebSocketTransportAdapter, WebSocketTransportError, type WebSocketConnection, type WebSocketTransportAdapterOptions } from "../src";

const SESSION = "44e4c186-38a3-4fd1-9b91-64fa39ef1966";
const REQUEST = "1cc321f1-406e-4bbf-bf62-37349f9988db";
const OTHER = "2cc321f1-406e-4bbf-bf62-37349f9988db";
const MESSAGE = "3cc321f1-406e-4bbf-bf62-37349f9988db";
const credentials = { version: 1, sessionId: SESSION, token: "A".repeat(43), expiresInSeconds: 1800, websocketPath: "/chat" };
const ready = { version: 1, type: "session-ready", sessionId: SESSION, notice: CAPABILITY_NOTICE, mode: "fixture" };
const reply = {
  version: 1, type: "agent-message", requestId: REQUEST,
  message: { id: MESSAGE, content: "Una película para ti.", timestamp: "2026-11-11T10:00:00.000Z" },
  movies: [{ id: 1, title: "Película", year: 2020, poster: "https://image.tmdb.org/t/p/w500/poster.jpg", imdbId: "tt1234567" }],
  references: [{ provider: "imdb", id: "tt1234567" }], actions: []
};

class FakeSocket extends EventTarget implements WebSocketConnection {
  public readonly sent: unknown[] = [];
  public readonly send = vi.fn((data: string) => { this.sent.push(JSON.parse(data) as unknown); });
  public readonly close = vi.fn();
  public receive(value: unknown): void { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })); }
}

const adapters: WebSocketTransportAdapter[] = [];
function harness(options: Partial<WebSocketTransportAdapterOptions> = {}) {
  const sockets: FakeSocket[] = [];
  const events: TransportEvent[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(JSON.stringify(credentials), { status: 201 }));
  const createWebSocket = vi.fn(() => { const socket = new FakeSocket(); sockets.push(socket); return socket; });
  const adapter = new WebSocketTransportAdapter({ url: "wss://example.test/chat", fetch, createWebSocket, createId: () => REQUEST, ...options });
  adapters.push(adapter);
  const unsubscribe = adapter.subscribe((event) => events.push(event));
  const authenticate = async () => {
    const connecting = adapter.connect();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const socket = sockets[0]!;
    socket.dispatchEvent(new Event("open"));
    socket.receive(ready);
    await connecting;
    return socket;
  };
  return { adapter, fetch, createWebSocket, sockets, events, unsubscribe, authenticate };
}

afterEach(() => {
  for (const adapter of adapters.splice(0)) { adapter.dispose(); }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WebSocketTransportAdapter", () => {
  it.each(["https://example.test/chat", "wss://example.test/other", "ws://user:pass@example.test/chat", "wss://example.test/chat?token=secret", "wss://example.test/chat#secret"])("rejects unsafe endpoint %s", (url) => {
    expect(() => new WebSocketTransportAdapter({ url })).toThrow(TypeError);
  });

  it.each([0, -1, NaN, 1.5])("rejects invalid timeouts %s", (timeout) => {
    expect(() => new WebSocketTransportAdapter({ url: "ws://example.test/chat", connectTimeoutMs: timeout })).toThrow(TypeError);
    expect(() => new WebSocketTransportAdapter({ url: "ws://example.test/chat", responseTimeoutMs: timeout })).toThrow(TypeError);
  });

  it("creates a session once and authenticates without putting credentials in the URL", async () => {
    const protocols = ["agichat.v1"];
    const { adapter, fetch, createWebSocket, authenticate, events } = harness({ protocols });
    const first = adapter.connect();
    expect(adapter.connect()).toBe(first);
    const socket = await authenticate();
    await first;
    await adapter.connect();
    expect(adapter.url.href).toBe("wss://example.test/chat");
    expect(adapter.protocols).toBe(protocols);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://example.test/sessions", expect.objectContaining({ method: "POST", cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(createWebSocket).toHaveBeenCalledWith("wss://example.test/chat", protocols);
    expect(socket.sent).toEqual([{ version: 1, type: "authenticate", sessionId: SESSION, token: credentials.token }]);
    expect(events).toContainEqual({ type: "session-ready", notice: CAPABILITY_NOTICE, mode: "fixture" });
    const listener = vi.fn();
    adapter.subscribe(listener)();
    expect(listener).toHaveBeenCalledWith({ type: "connection-state", status: "connected" });
    expect(listener).toHaveBeenCalledWith({ type: "session-ready", notice: CAPABILITY_NOTICE, mode: "fixture" });
  });

  it("maps ws to HTTP and preserves a string subprotocol", async () => {
    const { adapter, fetch, createWebSocket, authenticate } = harness({ url: new URL("ws://localhost:8000/chat"), protocols: "chat" });
    await authenticate();
    expect(adapter.url.protocol).toBe("ws:");
    expect(fetch.mock.calls[0]?.[0]).toBe("http://localhost:8000/sessions");
    expect(createWebSocket).toHaveBeenCalledWith("ws://localhost:8000/chat", "chat");
  });

  it("uses the browser APIs and UUID generator by default", async () => {
    const socket = new FakeSocket();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(credentials)));
    let created = false;
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("WebSocket", class { public constructor() { created = true; return socket; } });
    const adapter = new WebSocketTransportAdapter({ url: "ws://localhost:8000/chat" });
    adapters.push(adapter);
    const connected = adapter.connect();
    await vi.waitFor(() => expect(created).toBe(true));
    socket.dispatchEvent(new Event("open"));
    socket.receive(ready);
    await connected;
    const sent = adapter.sendMessage("Hola");
    await Promise.resolve();
    const frame = socket.sent.at(-1) as { requestId: string };
    expect(frame.requestId).toMatch(/^[a-f0-9-]{36}$/);
    socket.receive({ ...reply, requestId: frame.requestId });
    await sent;
  });

  it("waits for a correlated response and converts rich content and timestamps", async () => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const resolved = vi.fn();
    const sent = adapter.sendMessage("  Recomiéndame drama  ").then(resolved);
    await Promise.resolve();
    expect(socket.sent.at(-1)).toEqual({ version: 1, type: "user-message", requestId: REQUEST, content: "Recomiéndame drama" });
    expect(resolved).not.toHaveBeenCalled();
    socket.receive({ version: 1, type: "agent-typing", requestId: REQUEST, isTyping: true });
    expect(events).toContainEqual({ type: "agent-typing", isTyping: true });
    socket.receive({ ...reply, requestId: OTHER });
    socket.receive(reply);
    socket.receive(reply);
    await sent;
    const messages = events.filter((event) => event.type === "agent-message");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ message: {
      timestamp: new Date(reply.message.timestamp), cards: [{ id: "1", title: "Película", subtitle: "2020", image: { url: reply.movies[0]!.poster, alt: "Póster de Película" } }], references: reply.references
    } });
  });

  it("keeps absent images and years and emits structured actions only once", async () => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Abre IMDb");
    await Promise.resolve();
    const action = { type: "open-reference", reference: reply.references[0] };
    const response = { ...reply, movies: [{ ...reply.movies[0], year: null, poster: null }], actions: [action] };
    socket.receive(response);
    socket.receive(response);
    await sent;
    expect(events.filter((event) => event.type === "action")).toEqual([{ type: "action", requestId: REQUEST, action }]);
    expect(events.find((event) => event.type === "agent-message")).toMatchObject({ message: { cards: [{ subtitle: null, image: null }] } });
  });

  it.each(["", "   ", "a".repeat(4001)])("rejects invalid input without sending it", async (content) => {
    const { adapter, authenticate } = harness();
    const socket = await authenticate();
    await expect(adapter.sendMessage(content)).rejects.toMatchObject({ code: "invalid_frame" });
    expect(socket.sent).toHaveLength(1);
  });

  it("rejects concurrent sends even while the connection is starting", async () => {
    const { adapter, authenticate } = harness();
    const first = adapter.sendMessage("Hola");
    await expect(adapter.sendMessage("Otra petición")).rejects.toMatchObject({ code: "busy" });
    const socket = await authenticate();
    await Promise.resolve();
    socket.receive(reply);
    await first;
  });

  it("propagates request errors, ignores unrelated errors and allows the next turn", async () => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "busy", message: "Intenta nuevamente." });
    await Promise.resolve();
    const error = { version: 1, type: "error", code: "busy", message: "Intenta nuevamente.", retryable: true };
    socket.receive({ ...error, requestId: OTHER });
    socket.receive({ ...error, requestId: REQUEST });
    await rejected;
    const next = adapter.sendMessage("Otra petición");
    await Promise.resolve();
    socket.receive(reply);
    await next;
    expect(events.at(-1)).toEqual({ type: "agent-typing", isTyping: false });
  });

  it.each(["unauthorized", "session_expired"])("disconnects on %s", async (code) => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code });
    await Promise.resolve();
    socket.receive({ version: 1, type: "error", requestId: REQUEST, code, message: "Sesión inválida.", retryable: false });
    await rejected;
    expect(socket.close).toHaveBeenCalledOnce();
    expect(events).toContainEqual({ type: "connection-state", status: "disconnected" });
  });

  it.each([503, 403])("handles session HTTP failure %s", async (status) => {
    const { adapter, events } = harness({ fetch: vi.fn().mockResolvedValue(new Response(null, { status })) });
    await expect(adapter.connect()).rejects.toMatchObject({ code: "connection_failed" });
    expect(events.at(-1)).toMatchObject({ type: "transport-error" });
  });

  it.each([{}, { ...credentials, token: "invalid" }])("rejects invalid session credentials", async (value) => {
    const { adapter } = harness({ fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(value))) });
    await expect(adapter.connect()).rejects.toMatchObject({ code: "connection_failed" });
  });

  it.each(["error", "close"])("rejects connection failures from socket %s", async (type) => {
    const { adapter, sockets } = harness();
    const rejected = expect(adapter.connect()).rejects.toBeInstanceOf(WebSocketTransportError);
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0]!.dispatchEvent(new Event(type));
    await rejected;
  });

  it("rejects a session-ready frame with another session ID", async () => {
    const { adapter, sockets } = harness();
    const rejected = expect(adapter.connect()).rejects.toMatchObject({ code: "invalid_response" });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0]!.receive({ ...ready, sessionId: OTHER });
    await rejected;
  });

  it.each(["not json", JSON.stringify({ version: 2 }), new Uint8Array([1]), "a".repeat(32769)])("rejects malformed, binary or oversized frames", async (data) => {
    const { adapter, authenticate } = harness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "invalid_response" });
    await Promise.resolve();
    socket.dispatchEvent(new MessageEvent("message", { data }));
    await rejected;
  });

  it("rejects a poster outside the allowlist and arbitrary URL actions", async () => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "invalid_response" });
    await Promise.resolve();
    socket.receive({ ...reply, movies: [{ ...reply.movies[0], poster: "https://evil.invalid/tracker" }], actions: [{ type: "open-reference", url: "https://evil.invalid" }] });
    await rejected;
    expect(events.some((event) => event.type === "action" || event.type === "agent-message")).toBe(false);
  });

  it("times out stalled connections and aborts the session request", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise(() => undefined));
    const { adapter } = harness({ fetch, connectTimeoutMs: 100 });
    const rejected = expect(adapter.connect()).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("cancels timed out turns and ignores late responses", async () => {
    const { adapter, authenticate, events } = harness({ responseTimeoutMs: 100 });
    const socket = await authenticate();
    vi.useFakeTimers();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(socket.sent.at(-1)).toEqual({ version: 1, type: "cancel", requestId: REQUEST });
    socket.receive(reply);
    expect(events.some((event) => event.type === "agent-message")).toBe(false);
  });

  it("rejects pending requests on disconnect and removes all socket listeners", async () => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const remove = vi.spyOn(socket, "removeEventListener");
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "connection_failed" });
    await Promise.resolve();
    socket.dispatchEvent(new Event("close"));
    await rejected;
    expect(remove).toHaveBeenCalledTimes(4);
    const count = events.length;
    socket.receive(reply);
    socket.dispatchEvent(new Event("error"));
    expect(events).toHaveLength(count);
  });

  it("disposes during connection and rejects future use without leaking listeners", async () => {
    const { adapter, sockets, events, unsubscribe } = harness();
    const rejected = expect(adapter.connect()).rejects.toMatchObject({ code: "disposed" });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    unsubscribe();
    unsubscribe();
    const count = events.length;
    adapter.dispose();
    adapter.dispose();
    await rejected;
    expect(sockets[0]!.close).toHaveBeenCalledOnce();
    expect(events).toHaveLength(count);
    await expect(adapter.sendMessage("Hola")).rejects.toMatchObject({ code: "disposed" });
    expect(() => adapter.subscribe(vi.fn())).toThrow(WebSocketTransportError);
  });

  it("handles socket send failures without leaving pending promises", async () => {
    const { adapter, authenticate } = harness();
    const socket = await authenticate();
    socket.send.mockImplementation(() => { throw new Error("offline"); });
    await expect(adapter.sendMessage("Hola")).rejects.toMatchObject({ code: "connection_failed" });
  });
});
