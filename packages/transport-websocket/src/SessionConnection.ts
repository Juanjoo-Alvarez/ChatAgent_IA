import { parseServerFrame, sessionCredentialsSchema, type ClientFrame, type ServerFrame } from "@agichat/protocol";

import type { TransportConfiguration } from "./configuration";
import { WebSocketTransportError, type WebSocketConnection } from "./contracts";

interface ConnectionAttempt {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly controller: AbortController;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Posee las credenciales, la autenticación y los recursos de una conexión. */
export class SessionConnection {
  private credentials: ReturnType<typeof sessionCredentialsSchema.parse> | undefined;
  private attempt: ConnectionAttempt | undefined;
  private socket: WebSocketConnection | undefined;
  private removeListeners: (() => void) | undefined;
  private authenticated = false;

  public constructor(
    private readonly config: TransportConfiguration,
    private readonly onFrame: (frame: ServerFrame) => void,
    private readonly onFailure: (error: WebSocketTransportError, recover?: boolean) => void
  ) {}

  public get connected(): boolean { return this.authenticated; }
  public get connecting(): boolean { return this.attempt !== undefined; }

  public connect(): Promise<void> {
    if (this.connected) { return Promise.resolve(); }
    if (this.attempt !== undefined) { return this.attempt.promise; }
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((accept, decline) => { resolve = accept; reject = decline; });
    const attempt: ConnectionAttempt = {
      promise, resolve, reject, controller: new AbortController(),
      timer: setTimeout(() => this.onFailure(new WebSocketTransportError("timeout", "La conexión excedió el tiempo disponible."), true), this.config.connectTimeoutMs)
    };
    this.attempt = attempt;
    void this.open(attempt).catch((cause: unknown) => {
      if (this.attempt !== attempt) { return; }
      const error = cause instanceof WebSocketTransportError
        ? cause : new WebSocketTransportError("connection_failed", "No se pudo conectar con el servicio de chat.");
      this.onFailure(error, error.code === "connection_failed" || error.code === "unavailable");
    });
    return promise;
  }

  public send(frame: ClientFrame): void { this.socket?.send(JSON.stringify(frame)); }

  public close(error: Error): void {
    const attempt = this.attempt;
    this.attempt = undefined;
    if (attempt !== undefined) {
      clearTimeout(attempt.timer);
      attempt.controller.abort();
      attempt.reject(error);
    }
    this.removeListeners?.();
    this.removeListeners = undefined;
    const socket = this.socket;
    this.socket = undefined;
    this.authenticated = false;
    try { socket?.close(); } catch { /* El navegador puede haber cerrado el socket. */ }
  }

  public clearCredentials(): void { this.credentials = undefined; }

  private async open(attempt: ConnectionAttempt): Promise<void> {
    if (this.attempt !== attempt) { return; }
    if (this.credentials === undefined) {
      const response = await this.config.fetch(this.config.sessionUrl.href, {
        method: "POST", cache: "no-store", signal: attempt.controller.signal
      });
      if (!response.ok) {
        throw new WebSocketTransportError(response.status === 401 || response.status === 403 ? "unauthorized" : "unavailable", "No se pudo crear la sesión de chat.");
      }
      let credentials: ReturnType<typeof sessionCredentialsSchema.parse>;
      try { credentials = sessionCredentialsSchema.parse(await response.json() as unknown); }
      catch { throw new WebSocketTransportError("invalid_response", "El servidor devolvió una sesión inválida."); }
      if (this.attempt !== attempt) { return; }
      this.credentials = credentials;
    }
    if (this.attempt !== attempt) { return; }
    const { protocols } = this.config;
    const socket = this.config.createWebSocket(this.config.url.href,
      typeof protocols === "string" ? protocols : protocols === undefined ? undefined : [...protocols]);
    this.socket = socket;
    const listeners: Record<string, (event: Event) => void> = {
      open: () => {
        if (this.socket !== socket) { return; }
        try {
          socket.send(JSON.stringify({ version: 1, type: "authenticate", sessionId: this.credentials?.sessionId, token: this.credentials?.token }));
        } catch { this.onFailure(new WebSocketTransportError("connection_failed", "No se pudo autenticar la conexión."), true); }
      },
      message: (event) => {
        if (this.socket !== socket) { return; }
        this.receive((event as MessageEvent<unknown>).data);
      },
      error: () => {
        if (this.socket === socket) { this.onFailure(new WebSocketTransportError("connection_failed", "Ocurrió un error de conexión."), true); }
      },
      close: () => {
        if (this.socket === socket) { this.onFailure(new WebSocketTransportError("connection_failed", "Se perdió la conexión con el servicio de chat."), true); }
      }
    };
    for (const [type, listener] of Object.entries(listeners)) { socket.addEventListener(type, listener); }
    this.removeListeners = () => {
      for (const [type, listener] of Object.entries(listeners)) { socket.removeEventListener(type, listener); }
    };
  }

  private receive(data: unknown): void {
    let frame: ServerFrame;
    try {
      if (typeof data !== "string" || new TextEncoder().encode(data).byteLength > 32768) { throw new Error("invalid_frame"); }
      frame = parseServerFrame(data);
    } catch {
      this.onFailure(new WebSocketTransportError("invalid_response", "El servidor envió una respuesta inválida."));
      return;
    }
    if (frame.type === "session-ready") {
      const attempt = this.attempt;
      if (attempt === undefined || frame.sessionId !== this.credentials?.sessionId) {
        this.onFailure(new WebSocketTransportError("invalid_response", "El servidor confirmó una sesión inesperada."));
        return;
      }
      this.attempt = undefined;
      clearTimeout(attempt.timer);
      this.authenticated = true;
      attempt.resolve();
    }
    this.onFrame(frame);
  }
}
