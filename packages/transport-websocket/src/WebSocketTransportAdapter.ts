import type {
  ITransportAdapter,
  TransportEventHandler
} from "@agichat/core";

export interface WebSocketTransportAdapterOptions {
  readonly url: string | URL;
  readonly protocols?: string | readonly string[];
}

export class WebSocketTransportNotImplementedError extends Error {
  public constructor() {
    super("WebSocket transport will be implemented in Project 2");
    this.name = "WebSocketTransportNotImplementedError";
  }
}

/**
 * Contrato reservado para la implementación real de la Fase 2.
 * Mantiene desde ahora la misma interfaz que el adaptador mock.
 */
export class WebSocketTransportAdapter implements ITransportAdapter {
  public readonly url: URL;
  public readonly protocols: string | readonly string[] | undefined;

  private readonly handlers = new Set<TransportEventHandler>();

  public constructor(options: WebSocketTransportAdapterOptions) {
    this.url = new URL(options.url);
    this.protocols = options.protocols;

    if (this.url.protocol !== "ws:" && this.url.protocol !== "wss:") {
      throw new TypeError("WebSocket URL must use the ws: or wss: protocol");
    }
  }

  public sendMessage(content: string): Promise<void> {
    void content;
    return Promise.reject(new WebSocketTransportNotImplementedError());
  }

  public subscribe(handler: TransportEventHandler): () => void {
    this.handlers.add(handler);

    return () => {
      this.handlers.delete(handler);
    };
  }

  public dispose(): void {
    this.handlers.clear();
  }
}
