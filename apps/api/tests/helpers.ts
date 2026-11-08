import { randomUUID } from "node:crypto";

import type { ChatAgent } from "@agichat/agent";
import { parseServerFrame, sessionCredentialsSchema, type ServerFrame } from "@agichat/protocol";
import { vi } from "vitest";
import { WebSocket } from "ws";

import { loadApiConfig, type ApiConfig } from "../src/config.js";
import { createChatServer } from "../src/server.js";
import { InMemorySessionStore, type SessionStore } from "../src/sessions.js";

export const origin = "http://localhost:5173";
export const reply = { content: "Hola, puedo recomendarte una película.", movies: [], references: [], actions: [] };
export function fakeAgent(): ChatAgent { return { respond: vi.fn(async () => reply) }; }
export const running: ReturnType<typeof createChatServer>[] = [];
export const connected: WebSocket[] = [];
export async function start(agent = fakeAgent(), store: SessionStore = new InMemorySessionStore(), config: Partial<ApiConfig> = {}) {
  const app = createChatServer({ ...loadApiConfig({ AGENT_MODE: "fixture" }), port: 0, ...config }, agent, store);
  running.push(app);
  const address = await app.start();
  const base = `http://127.0.0.1:${address.port}`;
  const credentials = async () => {
    const response = await fetch(`${base}/sessions`, { method: "POST", headers: { Origin: origin } });
    expectStatus(response.status, 201);
    return sessionCredentialsSchema.parse(await response.json());
  };
  return { base, app, agent, store, credentials };
}
function expectStatus(actual: number, expected: number) { if (actual !== expected) { throw new Error(`Unexpected status ${actual}`); } }

export async function socket(base: string) {
  const ws = new WebSocket(base.replace("http:", "ws:") + "/chat", { origin });
  connected.push(ws);
  const frames: ServerFrame[] = [];
  ws.on("message", (raw) => frames.push(parseServerFrame(raw.toString())));
  ws.on("error", () => undefined);
  await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  return {
    ws, frames,
    send: (data: unknown) => ws.send(JSON.stringify(data)),
    next: async (type: ServerFrame["type"]) => {
      await vi.waitFor(() => { if (!frames.some((frame) => frame.type === type)) { throw new Error(`Waiting for ${type}`); } }, { timeout: 4000, interval: 10 });
      return frames.splice(frames.findIndex((frame) => frame.type === type), 1)[0] as ServerFrame;
    }
  };
}
export async function authenticated(base: string, credentials: Awaited<ReturnType<Awaited<ReturnType<typeof start>>["credentials"]>>) {
  const client = await socket(base);
  client.send({ version: 1, type: "authenticate", sessionId: credentials.sessionId, token: credentials.token });
  await client.next("session-ready");
  return client;
}
export function message(content = "Recomienda una película") { return { version: 1 as const, type: "user-message" as const, requestId: randomUUID(), content }; }
