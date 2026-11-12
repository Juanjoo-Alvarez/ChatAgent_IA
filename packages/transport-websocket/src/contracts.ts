import type { ErrorCode } from "@agichat/protocol";

/** Puerto del navegador que también permite inyectar sockets de prueba. */
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
  /** Reintentos automáticos por recuperación; 0 los desactiva. Por defecto, 3. */
  readonly maxReconnectAttempts?: number;
  readonly reconnectDelayMs?: number;
  readonly maxReconnectDelayMs?: number;
}

type TransportErrorCode = ErrorCode | "connection_failed" | "disposed" | "invalid_response";

export class WebSocketTransportError extends Error {
  public constructor(public readonly code: TransportErrorCode, message: string) {
    super(message);
    this.name = "WebSocketTransportError";
  }
}
