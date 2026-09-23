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
    // Normalizar la URL al construir el adaptador permite detectar una
    // configuración inválida antes de que la interfaz intente enviar mensajes.
    this.url = new URL(options.url);
    this.protocols = options.protocols;

    if (this.url.protocol !== "ws:" && this.url.protocol !== "wss:") {
      throw new TypeError("WebSocket URL must use the ws: or wss: protocol");
    }
  }

  public sendMessage(content: string): Promise<void> {
    // Este paquete reserva desde ahora el contrato que usará la conexión real
    // en el Proyecto 2, sin simular que un mensaje fue enviado correctamente.
    void content;
    return Promise.reject(new WebSocketTransportNotImplementedError());
  }

  public subscribe(handler: TransportEventHandler): () => void {
    this.handlers.add(handler);

    // Cada consumidor recibe una función de limpieza para evitar listeners
    // activos cuando el motor o el widget se desmontan.
    return () => {
      this.handlers.delete(handler);
    };
  }

  public dispose(): void {
    this.handlers.clear();
  }
}
