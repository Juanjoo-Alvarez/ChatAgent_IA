import type {
  ConnectionStatus, ITransportAdapter, TransportEvent, TransportEventHandler
} from "@agichat/core";
import {
  clientFrameSchema, parseServerFrame, sessionCredentialsSchema,
  type ErrorCode, type ServerFrame, type UserMessageFrame
} from "@agichat/protocol";

/** Puerto pequeño para probar el transporte sin conexiones ni servicios externos. */
export interface WebSocketConnection {
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface WebSocketTransportAdapterOptions {
  readonly url: string | URL;
  readonly protocols?: string | readonly string[];
  readonly fetch?: typeof globalThis.fetch;
  readonly createWebSocket?: (url: string, protocols?: string | string[]) => WebSocketConnection;
  readonly createId?: () => string;
  readonly connectTimeoutMs?: number;
  readonly responseTimeoutMs?: number;
}

type TransportErrorCode = ErrorCode | "connection_failed" | "disposed" | "invalid_response";

export class WebSocketTransportError extends Error {
  public constructor(public readonly code: TransportErrorCode, message: string) {
    super(message);
    this.name = "WebSocketTransportError";
  }
}

interface ConnectionAttempt {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly controller: AbortController;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface PendingRequest {
  readonly frame: UserMessageFrame;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Adaptador del protocolo v1. Las credenciales pertenecen a esta instancia. */
export class WebSocketTransportAdapter implements ITransportAdapter {
  public readonly url: URL;
  public readonly protocols: string | readonly string[] | undefined;
  private readonly sessionUrl: URL;
  private readonly fetchSession: typeof globalThis.fetch;
  private readonly createSocket: NonNullable<WebSocketTransportAdapterOptions["createWebSocket"]>;
  private readonly createId: () => string;
  private readonly connectTimeoutMs: number;
  private readonly responseTimeoutMs: number;
  private readonly handlers = new Set<TransportEventHandler>();
  private credentials: ReturnType<typeof sessionCredentialsSchema.parse> | undefined;
  private connection: ConnectionAttempt | undefined;
  private socket: WebSocketConnection | undefined;
  private removeListeners: (() => void) | undefined;
  private pending: PendingRequest | undefined;
  private status: ConnectionStatus = "idle";
  private ready: Extract<ServerFrame, { type: "session-ready" }> | undefined;
  private sending = false;
  private disposed = false;

  public constructor(options: WebSocketTransportAdapterOptions) {
    this.url = new URL(options.url);
    this.protocols = options.protocols;
    if (!["ws:", "wss:"].includes(this.url.protocol)) {
      throw new TypeError("WebSocket URL must use the ws: or wss: protocol");
    }
    if (this.url.username || this.url.password || this.url.search || this.url.hash || this.url.pathname !== "/chat") {
      throw new TypeError("WebSocket URL must use /chat without credentials, query or fragment");
    }
    this.sessionUrl = new URL(this.url);
    this.sessionUrl.protocol = this.url.protocol === "wss:" ? "https:" : "http:";
    this.sessionUrl.pathname = "/sessions";
    this.fetchSession = options.fetch ?? globalThis.fetch;
    this.createSocket = options.createWebSocket ?? ((url, protocols) => new WebSocket(url, protocols));
    this.createId = options.createId ?? (() => globalThis.crypto.randomUUID());
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10000;
    this.responseTimeoutMs = options.responseTimeoutMs ?? 65000;
    for (const timeout of [this.connectTimeoutMs, this.responseTimeoutMs]) {
      if (!Number.isSafeInteger(timeout) || timeout < 1) {
        throw new TypeError("Timeouts must be positive safe integers");
      }
    }
  }

  public connect(): Promise<void> {
    if (this.disposed) { return Promise.reject(new WebSocketTransportError("disposed", "El transporte fue cerrado.")); }
    if (this.status === "connected") { return Promise.resolve(); }
    if (this.connection !== undefined) { return this.connection.promise; }
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((accept, decline) => { resolve = accept; reject = decline; });
    const attempt: ConnectionAttempt = {
      promise, resolve, reject, controller: new AbortController(),
      timer: setTimeout(() => this.disconnect(new WebSocketTransportError("timeout", "La conexión excedió el tiempo disponible.")), this.connectTimeoutMs)
    };
    this.connection = attempt;
    this.setStatus("connecting");
    void this.openConnection(attempt).catch(() => {
      if (this.connection === attempt) {
        this.disconnect(new WebSocketTransportError("connection_failed", "No se pudo conectar con el servicio de chat."));
      }
    });
    return promise;
  }

  public async sendMessage(content: string): Promise<void> {
    if (this.sending) { throw new WebSocketTransportError("busy", "Hay una solicitud en curso. Intenta nuevamente."); }
    const parsed = clientFrameSchema.safeParse({ version: 1, type: "user-message", requestId: this.createId(), content });
    if (!parsed.success || parsed.data.type !== "user-message") {
      throw new WebSocketTransportError("invalid_frame", "El mensaje debe tener entre 1 y 4000 caracteres y un identificador válido.");
    }
    const frame = parsed.data;
    this.sending = true;
    try {
      await this.connect();
      const socket = this.socket;
      if (this.disposed || this.status !== "connected" || socket === undefined) {
        throw new WebSocketTransportError("connection_failed", "La conexión ya no está disponible.");
      }
      await new Promise<void>((resolve, reject) => {
        this.pending = {
          frame, resolve, reject,
          timer: setTimeout(() => {
            this.sendCancellation(frame.requestId);
            this.finishRequest(new WebSocketTransportError("timeout", "La solicitud excedió el tiempo disponible."));
          }, this.responseTimeoutMs)
        };
        try { socket.send(JSON.stringify(frame)); }
        catch { this.disconnect(new WebSocketTransportError("connection_failed", "No se pudo enviar el mensaje.")); }
      });
    } finally { this.sending = false; }
  }

  public subscribe(handler: TransportEventHandler): () => void {
    if (this.disposed) { throw new WebSocketTransportError("disposed", "El transporte fue cerrado."); }
    this.handlers.add(handler);
    handler({ type: "connection-state", status: this.status });
    if (this.ready !== undefined) { handler({ type: "session-ready", notice: this.ready.notice, mode: this.ready.mode }); }
    // La suscripción inicia la sesión para mostrar capacidades antes del primer mensaje.
    void this.connect().catch(() => undefined);
    return () => { this.handlers.delete(handler); };
  }

  public dispose(): void {
    if (this.disposed) { return; }
    this.disposed = true;
    this.disconnect(new WebSocketTransportError("disposed", "El transporte fue cerrado."), false);
    this.credentials = undefined;
    this.handlers.clear();
  }

  private async openConnection(attempt: ConnectionAttempt): Promise<void> {
    if (this.credentials === undefined) {
      const response = await this.fetchSession(this.sessionUrl.href, {
        method: "POST", cache: "no-store", signal: attempt.controller.signal
      });
      if (!response.ok) { throw new Error("session_unavailable"); }
      const credentials = sessionCredentialsSchema.parse(await response.json() as unknown);
      if (this.connection !== attempt) { return; }
      this.credentials = credentials;
    }
    if (this.connection !== attempt) { return; }
    const protocols = typeof this.protocols === "string" ? this.protocols : this.protocols === undefined ? undefined : [...this.protocols];
    const socket = this.createSocket(this.url.href, protocols);
    this.socket = socket;
    const listeners: Record<string, (event: Event) => void> = {
      open: () => {
        try {
          socket.send(JSON.stringify({ version: 1, type: "authenticate", sessionId: this.credentials?.sessionId, token: this.credentials?.token }));
        } catch { this.disconnect(new WebSocketTransportError("connection_failed", "No se pudo autenticar la conexión.")); }
      },
      message: (event) => {
        let frame: ServerFrame;
        try {
          const data = (event as MessageEvent<unknown>).data;
          if (typeof data !== "string" || new TextEncoder().encode(data).byteLength > 32768) { throw new Error("invalid_frame"); }
          frame = parseServerFrame(data);
        } catch {
          this.disconnect(new WebSocketTransportError("invalid_response", "El servidor envió una respuesta inválida."));
          return;
        }
        this.handleFrame(frame);
      },
      error: () => this.disconnect(new WebSocketTransportError("connection_failed", "Ocurrió un error de conexión.")),
      close: () => this.disconnect(new WebSocketTransportError("connection_failed", "Se perdió la conexión con el servicio de chat."))
    };
    for (const [type, listener] of Object.entries(listeners)) { socket.addEventListener(type, listener); }
    this.removeListeners = () => {
      for (const [type, listener] of Object.entries(listeners)) { socket.removeEventListener(type, listener); }
    };
  }

  private handleFrame(frame: ServerFrame): void {
    if (frame.type === "session-ready") {
      if (this.connection === undefined || frame.sessionId !== this.credentials?.sessionId) {
        this.disconnect(new WebSocketTransportError("invalid_response", "El servidor confirmó una sesión inesperada."));
        return;
      }
      const attempt = this.connection;
      this.connection = undefined;
      clearTimeout(attempt.timer);
      this.ready = frame;
      this.setStatus("connected");
      this.emit({ type: "session-ready", notice: frame.notice, mode: frame.mode });
      attempt.resolve();
      return;
    }
    if (frame.type === "error") {
      const error = new WebSocketTransportError(frame.code, frame.message);
      if (frame.requestId === undefined || frame.code === "unauthorized" || frame.code === "session_expired") {
        this.disconnect(error);
      } else if (frame.requestId === this.pending?.frame.requestId) {
        this.finishRequest(error);
      }
      return;
    }
    if (this.status !== "connected" || frame.requestId !== this.pending?.frame.requestId) { return; }
    if (frame.type === "agent-typing") { this.emit({ type: "agent-typing", isTyping: frame.isTyping }); return; }
    this.emit({
      type: "agent-message",
      message: {
        ...frame.message, timestamp: new Date(frame.message.timestamp),
        cards: frame.movies.map((movie) => ({
          id: String(movie.id), title: movie.title, subtitle: movie.year === null ? null : String(movie.year),
          image: movie.poster === null ? null : { url: movie.poster, alt: `Póster de ${movie.title}` }
        })),
        references: frame.references
      }
    });
    for (const action of frame.actions) { this.emit({ type: "action", requestId: frame.requestId, action }); }
    this.finishRequest();
  }

  private sendCancellation(requestId: string): void {
    try { this.socket?.send(JSON.stringify({ version: 1, type: "cancel", requestId })); }
    catch { /* La limpieza local debe continuar aunque la conexión ya no responda. */ }
  }

  private finishRequest(error?: Error): void {
    const pending = this.pending;
    if (pending === undefined) { return; }
    this.pending = undefined;
    clearTimeout(pending.timer);
    this.emit({ type: "agent-typing", isTyping: false });
    if (error === undefined) { pending.resolve(); }
    else { pending.reject(error); }
  }

  private disconnect(error: Error, report = true): void {
    const attempt = this.connection;
    this.connection = undefined;
    if (attempt !== undefined) {
      clearTimeout(attempt.timer);
      attempt.controller.abort();
      attempt.reject(error);
    }
    this.removeListeners?.();
    this.removeListeners = undefined;
    const socket = this.socket;
    this.socket = undefined;
    this.ready = undefined;
    try { socket?.close(); } catch { /* El socket puede haber sido cerrado por el navegador. */ }
    this.finishRequest(error);
    this.setStatus("disconnected");
    if (report) { this.emit({ type: "transport-error", error }); }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.emit({ type: "connection-state", status });
  }

  private emit(event: TransportEvent): void {
    for (const handler of this.handlers) { handler(event); }
  }
}
