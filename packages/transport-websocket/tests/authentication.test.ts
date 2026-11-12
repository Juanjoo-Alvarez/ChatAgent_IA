import { describe, afterEach, expect, it, vi } from "vitest";
import { CAPABILITY_NOTICE } from "@agichat/protocol";
import { WebSocketTransportAdapter, WebSocketTransportError } from "../src";
import { cleanupTransports, SESSION, OTHER, credentials, ready, reply, FakeSocket, adapters, harness, recoveryHarness, acceptSocket } from "./helpers/transportHarness";

afterEach(cleanupTransports);

describe("WebSocket authentication", () => {
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
    const fetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) { throw new TypeError("Illegal invocation"); }
      return Promise.resolve(new Response(JSON.stringify(credentials)));
    });
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

  it.each([[503, "unavailable"], [403, "unauthorized"]] as const)("handles session HTTP failure %s", async (status, code) => {
    const { adapter, events } = harness({ fetch: vi.fn().mockResolvedValue(new Response(null, { status })) });
    await expect(adapter.connect()).rejects.toMatchObject({ code });
    expect(events.at(-1)).toMatchObject({ type: "transport-error" });
  });

  it.each([{}, { ...credentials, token: "invalid" }])("rejects invalid session credentials", async (value) => {
    const { adapter } = harness({ fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(value))) });
    await expect(adapter.connect()).rejects.toMatchObject({ code: "invalid_response" });
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

  it("times out stalled connections and aborts the session request", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise(() => undefined));
    const { adapter } = harness({ fetch, connectTimeoutMs: 100 });
    const rejected = expect(adapter.connect()).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("recovers after a transient session creation failure", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(credentials)));
    const { adapter, sockets, events } = recoveryHarness({ fetch });
    const rejected = expect(adapter.connect()).rejects.toMatchObject({ code: "unavailable" });
    await vi.advanceTimersByTimeAsync(0);
    await rejected;
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets).toHaveLength(1);
    acceptSocket(sockets[0]!);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({ type: "session-ready" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
