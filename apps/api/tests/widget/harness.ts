import { randomUUID } from "node:crypto";
import { transferableAbortController } from "node:util";
import { mountChatWidget, WebSocketTransportAdapter, type WebSocketTransportAdapterOptions } from "@agichat/embed";
import type { ChatAgent } from "@agichat/agent";
import { vi } from "vitest";
import { WebSocket } from "ws";
import { InMemorySessionStore } from "../../src/sessions.js";
import { start, origin, running } from "../helpers.js";
import { journeyAgent } from "./fixtures.js";

const clients: { unmount: () => boolean; transport: WebSocketTransportAdapter; host: HTMLDivElement }[] = [];

export async function widgetServer(agent: ChatAgent = journeyAgent()) {
  // El fetch y el backend de Node necesitan señales nativas, no las de jsdom.
  const controller = transferableAbortController();
  vi.stubGlobal("AbortController", controller.constructor);
  vi.stubGlobal("AbortSignal", controller.signal.constructor);
  const store = new InMemorySessionStore();
  const createSession = vi.spyOn(store, "create");
  return { ...await start(agent, store), createSession };
}

export async function mountClient(base: string) {
  const sockets: WebSocket[] = [];
  type Socket = ReturnType<NonNullable<WebSocketTransportAdapterOptions["createWebSocket"]>>;
  const transport = new WebSocketTransportAdapter({
    url: base.replace("http:", "ws:") + "/chat", createId: randomUUID,
    maxReconnectAttempts: 3, reconnectDelayMs: 20, maxReconnectDelayMs: 100,
    // Node no genera Origin automáticamente; se emula la cabecera del navegador.
    fetch: (url, options) => fetch(url, { ...options, headers: { Origin: origin } }),
    createWebSocket: (url) => {
      const socket = new WebSocket(url, { origin });
      sockets.push(socket);
      return socket as unknown as Socket;
    }
  });
  const host = document.createElement("div");
  document.body.append(host);
  const unmount = mountChatWidget(host, { transport, showTmdbCredits: true });
  clients.push({ unmount, transport, host });
  await transport.connect();
  await vi.waitFor(() => {
    if (!host.textContent?.includes("Puedo recomendarte")) { throw new Error("Waiting for capability notice"); }
  });
  return { host, transport, sockets, unmount };
}

export async function send(host: HTMLElement, content: string): Promise<void> {
  const textarea = host.querySelector("textarea")!;
  await vi.waitFor(() => { if (textarea.disabled) { throw new Error("Waiting for previous turn"); } });
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  setValue.call(textarea, content);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await vi.waitFor(() => {
    if (host.querySelector<HTMLButtonElement>("button[type=submit]")!.disabled) { throw new Error("Waiting for input update"); }
  });
  host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

export async function text(host: HTMLElement, expected: string): Promise<void> {
  await vi.waitFor(() => {
    if (!host.textContent?.includes(expected)) { throw new Error(`Waiting for ${expected}`); }
  }, { timeout: 5000 });
}

export async function cleanupWidgets(): Promise<void> {
  for (const client of clients.splice(0)) {
    client.unmount(); client.transport.dispose(); client.host.remove();
  }
  await Promise.all(running.splice(0).map((server) => server.stop()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}
