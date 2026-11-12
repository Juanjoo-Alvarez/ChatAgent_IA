import type { ConnectionStatus, ITransportAdapter, TransportEvent, TransportEventHandler } from "@agichat/core";
import { clientFrameSchema, type ServerFrame, type UserMessageFrame } from "@agichat/protocol";

import { resolveConfiguration, type TransportConfiguration } from "./configuration";
import { WebSocketTransportError, type WebSocketTransportAdapterOptions } from "./contracts";
import { toAgentMessage } from "./messageContent";
import { ReconnectController } from "./ReconnectController";
import { SessionConnection } from "./SessionConnection";

interface PendingRequest {
  readonly frame: UserMessageFrame;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  replaying: boolean;
}

/** Orquesta turnos y eventos; delega la sesión y la espera entre reconexiones. */
export class WebSocketTransportAdapter implements ITransportAdapter {
  public readonly url: URL;
  public readonly protocols: string | readonly string[] | undefined;
  private readonly config: TransportConfiguration;
  private readonly connection: SessionConnection;
  private readonly recovery: ReconnectController;
  private readonly handlers = new Set<TransportEventHandler>();
  private readonly deliveredMessages = new Set<string>();
  private pending: PendingRequest | undefined;
  private status: ConnectionStatus = "idle";
  private ready: Extract<ServerFrame, { type: "session-ready" }> | undefined;
  private terminalError: WebSocketTransportError | undefined;
  private sending = false;
  private sendCancelled = false;
  private waitingForConnection = false;
  private disposed = false;

  public constructor(options: WebSocketTransportAdapterOptions) {
    this.config = resolveConfiguration(options);
    this.url = this.config.url;
    this.protocols = this.config.protocols;
    this.recovery = new ReconnectController(this.config);
    this.connection = new SessionConnection(this.config,
      (frame) => this.handleFrame(frame), (error, recover) => this.disconnect(error, recover));
  }

  public connect(): Promise<void> {
    // Una llamada explícita puede volver a intentar una caída transitoria agotada.
    this.recovery.cancel();
    if (this.pending === undefined) { this.recovery.reset(); }
    return this.startConnection();
  }

  public async sendMessage(content: string): Promise<void> {
    if (this.sending) { throw new WebSocketTransportError("busy", "Hay una solicitud en curso. Intenta nuevamente."); }
    const parsed = clientFrameSchema.safeParse({ version: 1, type: "user-message", requestId: this.config.createId(), content });
    if (!parsed.success || parsed.data.type !== "user-message") {
      throw new WebSocketTransportError("invalid_frame", "El mensaje debe tener entre 1 y 4000 caracteres y un identificador válido.");
    }
    const frame = parsed.data;
    this.sending = true;
    this.sendCancelled = false;
    this.waitingForConnection = true;
    try {
      await this.connect();
      this.waitingForConnection = false;
      if (this.sendCancelled) { throw new WebSocketTransportError("cancelled", "Solicitud cancelada."); }
      if (this.disposed || this.status !== "connected" || !this.connection.connected) {
        throw new WebSocketTransportError("connection_failed", "La conexión ya no está disponible.");
      }
      await new Promise<void>((resolve, reject) => {
        this.pending = {
          frame, resolve, reject, replaying: false,
          timer: setTimeout(() => {
            this.sendCancellation(frame.requestId);
            this.finishRequest(new WebSocketTransportError("timeout", "La solicitud excedió el tiempo disponible."));
          }, this.config.responseTimeoutMs)
        };
        this.transmitPending();
      });
    } finally {
      this.sending = false;
      this.waitingForConnection = false;
    }
  }

  public subscribe(handler: TransportEventHandler): () => void {
    if (this.disposed) { throw new WebSocketTransportError("disposed", "El transporte fue cerrado."); }
    this.handlers.add(handler);
    handler({ type: "connection-state", status: this.status });
    if (this.ready !== undefined) { handler({ type: "session-ready", notice: this.ready.notice, mode: this.ready.mode }); }
    if (this.terminalError !== undefined) { handler({ type: "transport-error", error: this.terminalError }); }
    // La suscripción inicia la sesión para mostrar capacidades antes del primer mensaje.
    if (!this.recovery.scheduled) { void this.startConnection().catch(() => undefined); }
    return () => {
      if (this.handlers.delete(handler) && this.handlers.size === 0) {
        this.disconnect(new WebSocketTransportError("cancelled", "El chat se desconectó."), false, false);
      }
    };
  }

  public cancel(): void {
    if (this.pending === undefined) {
      if (this.waitingForConnection) {
        this.sendCancelled = true;
        this.disconnect(new WebSocketTransportError("cancelled", "Solicitud cancelada."), false, false);
      }
      return;
    }
    this.sendCancelled = true;
    this.sendCancellation(this.pending.frame.requestId);
    this.finishRequest(new WebSocketTransportError("cancelled", "Solicitud cancelada."));
  }

  public dispose(): void {
    if (this.disposed) { return; }
    this.disposed = true;
    this.disconnect(new WebSocketTransportError("disposed", "El transporte fue cerrado."), false, false);
    this.connection.clearCredentials();
    this.deliveredMessages.clear();
    this.handlers.clear();
  }

  private startConnection(): Promise<void> {
    if (this.disposed) { return Promise.reject(new WebSocketTransportError("disposed", "El transporte fue cerrado.")); }
    if (this.terminalError !== undefined) { return Promise.reject(this.terminalError); }
    const starting = !this.connection.connected && !this.connection.connecting;
    const promise = this.connection.connect();
    if (starting) { this.setStatus("connecting"); }
    return promise;
  }

  private handleFrame(frame: ServerFrame): void {
    if (frame.type === "session-ready") {
      this.ready = frame;
      if (this.pending === undefined) { this.recovery.reset(); }
      this.setStatus("connected");
      this.emit({ type: "session-ready", notice: frame.notice, mode: frame.mode });
      this.transmitPending();
      return;
    }
    if (frame.type === "error") { this.handleError(frame); return; }
    if (this.status !== "connected" || frame.requestId !== this.pending?.frame.requestId) { return; }
    if (frame.type === "agent-typing") { this.emit({ type: "agent-typing", isTyping: frame.isTyping }); return; }
    // Retirar primero la petición evita reentradas y entregas duplicadas.
    this.finishRequest();
    this.recovery.reset();
    if (this.deliveredMessages.has(frame.message.id)) { return; }
    this.deliveredMessages.add(frame.message.id);
    if (this.deliveredMessages.size > 20) {
      this.deliveredMessages.delete(this.deliveredMessages.values().next().value!);
    }
    this.emit({ type: "agent-message", message: toAgentMessage(frame) });
    for (const action of frame.actions) { this.emit({ type: "action", requestId: frame.requestId, action }); }
  }

  private handleError(frame: Extract<ServerFrame, { type: "error" }>): void {
    const error = new WebSocketTransportError(frame.code, frame.message);
    if (frame.requestId === undefined || frame.code === "unauthorized" || frame.code === "session_expired") {
      this.disconnect(error, frame.retryable);
    } else if (frame.requestId === this.pending?.frame.requestId) {
      // El lease de la conexión anterior puede seguir liberándose al recuperar.
      if (frame.code === "busy" && frame.retryable && this.pending.replaying) {
        this.disconnect(error, true);
      } else { this.finishRequest(error); }
    }
  }

  private transmitPending(): void {
    if (this.pending === undefined || this.status !== "connected") { return; }
    try { this.connection.send(this.pending.frame); }
    catch { this.disconnect(new WebSocketTransportError("connection_failed", "No se pudo enviar el mensaje."), true); }
  }

  private sendCancellation(requestId: string): void {
    if (this.status !== "connected") { return; }
    try { this.connection.send({ version: 1, type: "cancel", requestId }); }
    catch { /* La limpieza local continúa aunque la conexión ya no responda. */ }
  }

  private finishRequest(error?: Error): void {
    const pending = this.pending;
    if (pending === undefined) { return; }
    this.pending = undefined;
    clearTimeout(pending.timer);
    if (error === undefined) { pending.resolve(); }
    else { pending.reject(error); }
    this.emit({ type: "agent-typing", isTyping: false });
  }

  private disconnect(error: WebSocketTransportError, recover = false, report = true): void {
    this.recovery.cancel();
    if (["unauthorized", "session_expired", "invalid_response"].includes(error.code)) {
      this.terminalError = error;
      recover = false;
    }
    this.connection.close(error);
    this.ready = undefined;
    const retry = recover && !this.disposed && (this.handlers.size > 0 || this.pending !== undefined)
      && this.recovery.schedule(() => { void this.startConnection().catch(() => undefined); });
    if (retry) {
      if (this.pending !== undefined) { this.pending.replaying = true; }
    } else { this.finishRequest(error); }
    this.emit({ type: "agent-typing", isTyping: false });
    this.setStatus("disconnected");
    if (report && !retry) { this.emit({ type: "transport-error", error }); }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.emit({ type: "connection-state", status });
  }

  private emit(event: TransportEvent): void {
    for (const handler of this.handlers) { handler(event); }
  }
}
