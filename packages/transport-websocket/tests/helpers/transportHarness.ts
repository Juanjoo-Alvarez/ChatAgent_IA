import type { TransportEvent } from "@agichat/core";
import { CAPABILITY_NOTICE } from "@agichat/protocol";
import { expect, vi } from "vitest";
import { WebSocketTransportAdapter, type WebSocketConnection, type WebSocketTransportAdapterOptions } from "../../src";

export const SESSION = "44e4c186-38a3-4fd1-9b91-64fa39ef1966";

export const REQUEST = "1cc321f1-406e-4bbf-bf62-37349f9988db";

export const OTHER = "2cc321f1-406e-4bbf-bf62-37349f9988db";

export const MESSAGE = "3cc321f1-406e-4bbf-bf62-37349f9988db";

export const credentials = { version: 1, sessionId: SESSION, token: "A".repeat(43), expiresInSeconds: 1800, websocketPath: "/chat" };

export const ready = { version: 1, type: "session-ready", sessionId: SESSION, notice: CAPABILITY_NOTICE, mode: "fixture" };

export const reply = {
  version: 1, type: "agent-message", requestId: REQUEST,
  message: { id: MESSAGE, content: "Una película para ti.", timestamp: "2026-11-11T10:00:00.000Z" },
  movies: [{ id: 1, title: "Película", year: 2020, poster: "https://image.tmdb.org/t/p/w500/poster.jpg", imdbId: "tt1234567" }],
  references: [{ provider: "imdb", id: "tt1234567" }], actions: []
};

export class FakeSocket extends EventTarget implements WebSocketConnection {
  public readonly sent: unknown[] = [];
  public readonly send = vi.fn((data: string) => { this.sent.push(JSON.parse(data) as unknown); });
  public readonly close = vi.fn();
  public receive(value: unknown): void { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })); }
}

export const adapters: WebSocketTransportAdapter[] = [];

export function harness(options: Partial<WebSocketTransportAdapterOptions> = {}) {
  const sockets: FakeSocket[] = [];
  const events: TransportEvent[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(JSON.stringify(credentials), { status: 201 }));
  const createWebSocket = vi.fn(() => { const socket = new FakeSocket(); sockets.push(socket); return socket; });
  const adapter = new WebSocketTransportAdapter({ url: "wss://example.test/chat", fetch, createWebSocket, createId: () => REQUEST, maxReconnectAttempts: 0, ...options });
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

export function recoveryHarness(options: Partial<WebSocketTransportAdapterOptions> = {}) {
  return harness({ maxReconnectAttempts: 3, reconnectDelayMs: 100, maxReconnectDelayMs: 250, responseTimeoutMs: 5000, ...options });
}

export function acceptSocket(socket: FakeSocket): void {
  socket.dispatchEvent(new Event("open"));
  socket.receive(ready);
}

export function cleanupTransports(): void {
  for (const adapter of adapters.splice(0)) { adapter.dispose(); }
  vi.useRealTimers();
  vi.unstubAllGlobals();
}
