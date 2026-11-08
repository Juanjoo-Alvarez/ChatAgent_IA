import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { AgentError, resolveReferenceRequest, type ChatAgent } from "@agichat/agent";
import { CAPABILITY_NOTICE, parseClientFrame, serverFrameSchema, type ErrorCode, type ServerFrame, type UserMessageFrame } from "@agichat/protocol";
import { WebSocket, WebSocketServer } from "ws";

import type { ApiConfig } from "./config.js";
import type { SessionStore } from "./sessions.js";

export function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
function hashMatches(a: string, b: string): boolean {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => { signal.removeEventListener("abort", aborted); reject(signal.reason); };
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) { aborted(); }
    void operation.then(
      (value) => { signal.removeEventListener("abort", aborted); resolve(value); },
      (cause: unknown) => { signal.removeEventListener("abort", aborted); reject(cause); }
    );
  });
}

export function createChatServer(config: ApiConfig, agent: ChatAgent, store: SessionStore) {
  let activeTurns = 0;
  const pending = new Set<Promise<void>>();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 32768, perMessageDeflate: false });
  const originAllowed = (origin: string | undefined) => origin !== undefined && config.origins.includes(origin);
  const http = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.url === "/healthz" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"status":"ok"}'); return;
    }
    if (req.url !== "/sessions") { res.writeHead(404).end(); return; }
    if (!originAllowed(req.headers.origin)) { res.writeHead(403).end(); return; }
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin as string);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.writeHead(204).end(); return;
    }
    if (req.method !== "POST") { res.writeHead(405, { Allow: "POST, OPTIONS" }).end(); return; }
    req.resume();
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    store.create(id, tokenHash(token), config.sessionTtlMs).then(() => {
      res.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ version: 1, sessionId: id, token, expiresInSeconds: Math.ceil(config.sessionTtlMs / 1000), websocketPath: "/chat" }));
    }).catch(() => { res.writeHead(503).end(); });
  });
  http.on("upgrade", (req, socket, head) => {
    if (req.url !== "/chat" || !originAllowed(req.headers.origin) || sockets.clients.size >= config.maxConnections) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit("connection", ws));
  });

  sockets.on("connection", (ws) => {
    let auth: { id: string; hash: string } | undefined;
    let authenticating = false;
    let current: { id: string; controller: AbortController } | undefined;
    let frameCount = 0;
    let windowStart = Date.now();
    const disconnected = new AbortController();
    const send = (frame: ServerFrame) => { if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(serverFrameSchema.parse(frame))); } };
    const error = (code: ErrorCode, requestId?: string) => send({
      version: 1, type: "error", ...(requestId === undefined ? {} : { requestId }), code,
      message: ({ invalid_frame: "Mensaje inválido.", unauthorized: "Sesión no autorizada.", session_expired: "La sesión expiró.", busy: "Hay una solicitud en curso. Intenta nuevamente.", duplicate_request: "El identificador ya se utilizó para otra solicitud.", timeout: "La solicitud excedió el tiempo disponible.", cancelled: "Solicitud cancelada.", unavailable: "El servicio no está disponible temporalmente.", policy_denied: "La operación no está permitida.", limit_exceeded: "La solicitud excedió los límites permitidos." })[code],
      retryable: ["busy", "timeout", "unavailable"].includes(code)
    });
    const authTimer = setTimeout(() => { ws.close(1008, "Authentication required"); }, 5000);
    ws.on("error", () => { disconnected.abort(); });
    ws.on("close", () => { clearTimeout(authTimer); disconnected.abort(); current?.controller.abort(); });

    const handleTurn = async (frame: UserMessageFrame) => {
      if (auth === undefined) { return; }
      const identity = auth;
      if (current !== undefined || activeTurns >= config.maxConcurrentTurns) { error("busy", frame.requestId); return; }
      const controller = new AbortController();
      current = { id: frame.requestId, controller };
      activeTurns += 1;
      const timeout = setTimeout(() => controller.abort(new Error("timeout")), config.turnTimeoutMs);
      const signal = AbortSignal.any([controller.signal, disconnected.signal]);
      const owner = randomUUID();
      let acquired = false;
      const fingerprint = tokenHash(JSON.stringify([frame.content, frame.openReference ?? null]));
      try {
        acquired = await store.acquire(identity.id, identity.hash, owner, config.turnTimeoutMs + 5000);
        if (!acquired) {
          error(await store.get(identity.id) === null ? "session_expired" : "busy", frame.requestId); return;
        }
        const session = await store.get(identity.id);
        if (session === null) { error("session_expired", frame.requestId); return; }
        const previous = session.turns.find((turn) => turn.requestId === frame.requestId);
        if (previous !== undefined) {
          if (previous.fingerprint !== fingerprint) { error("duplicate_request", frame.requestId); }
          else { send({ ...previous.frame, actions: [] }); }
          return;
        }
        signal.throwIfAborted();
        send({ version: 1, type: "agent-typing", requestId: frame.requestId, isTyping: true });
        const reply = await abortable(agent.respond({
          content: frame.content,
          history: session.turns.map((turn) => ({ user: turn.user, assistant: turn.frame.message.content, references: turn.frame.references })),
          ...(frame.openReference === undefined ? {} : { openReference: frame.openReference }), signal
        }), signal);
        signal.throwIfAborted();
        const navigation = resolveReferenceRequest(frame.content, session.turns.flatMap((turn) => turn.frame.references), frame.openReference);
        if (reply.actions.some((action) => navigation.reference === null
          || action.reference.provider !== navigation.reference.provider || action.reference.id !== navigation.reference.id)) {
          throw new AgentError("policy_denied");
        }
        const response = serverFrameSchema.parse({
          version: 1, type: "agent-message", requestId: frame.requestId,
          message: { id: randomUUID(), content: reply.content, timestamp: new Date().toISOString() },
          movies: reply.movies, references: reply.references, actions: reply.actions
        });
        if (response.type !== "agent-message") { throw new Error("invalid_agent_response"); }
        const committed = await store.commit(identity.id, owner, { requestId: frame.requestId, fingerprint, user: frame.content, frame: response }, config.sessionTtlMs);
        signal.throwIfAborted();
        if (!committed) { error("session_expired", frame.requestId); return; }
        send(response);
      } catch (cause) {
        if (!disconnected.signal.aborted) {
          error(signal.aborted ? (controller.signal.reason instanceof Error && controller.signal.reason.message === "timeout" ? "timeout" : "cancelled") : cause instanceof AgentError ? cause.code : "unavailable", frame.requestId);
        }
      } finally {
        clearTimeout(timeout);
        if (acquired) { await store.release(identity.id, owner).catch(() => undefined); }
        current = undefined;
        activeTurns -= 1;
        send({ version: 1, type: "agent-typing", requestId: frame.requestId, isTyping: false });
      }
    };

    ws.on("message", (raw, binary) => {
      if (Date.now() - windowStart > 60000) { frameCount = 0; windowStart = Date.now(); }
      frameCount += 1;
      if (frameCount > 60) { ws.close(1008, "Frame limit exceeded"); return; }
      let frame;
      try {
        if (binary) { throw new Error("binary_frame"); }
        frame = parseClientFrame(raw.toString());
      } catch { error("invalid_frame"); return; }
      if (frame.type === "authenticate") {
        if (auth !== undefined || authenticating) { error("unauthorized"); return; }
        authenticating = true;
        const identity = frame;
        const attempt = store.get(identity.sessionId).then((session) => {
          const hash = tokenHash(identity.token);
          if (session === null || !hashMatches(session.tokenHash, hash)) { error("unauthorized"); ws.close(1008); return; }
          auth = { id: identity.sessionId, hash };
          clearTimeout(authTimer);
          send({ version: 1, type: "session-ready", sessionId: identity.sessionId, notice: CAPABILITY_NOTICE, mode: config.mode });
        }).catch(() => { error("unavailable"); ws.close(1011); });
        pending.add(attempt);
        void attempt.finally(() => pending.delete(attempt));
        return;
      }
      if (auth === undefined) { error("unauthorized"); return; }
      if (frame.type === "cancel") {
        if (current?.id === frame.requestId) { current.controller.abort(); }
        return;
      }
      const task = handleTurn(frame);
      pending.add(task);
      void task.finally(() => pending.delete(task));
    });
  });

  return {
    start: () => new Promise<AddressInfo>((resolve, reject) => {
      http.once("error", reject);
      http.listen(config.port, config.host, () => { http.off("error", reject); resolve(http.address() as AddressInfo); });
    }),
    stop: async () => {
      sockets.clients.forEach((ws) => ws.terminate());
      await Promise.allSettled([...pending]);
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => { http.close(() => resolve()); http.closeAllConnections(); });
    }
  };
}
