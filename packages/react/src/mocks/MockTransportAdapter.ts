import type {
  ITransportAdapter,
  TransportEvent,
  TransportEventHandler
} from "@agichat/core";

export interface MockTransportAdapterOptions {
  readonly typingDelayMs?: number;
  readonly replyDelayMs?: number;
  readonly createReply?: (userContent: string) => string;
  readonly createId?: () => string;
  readonly now?: () => Date;
}

const defaultCreateReply = (userContent: string): string =>
  [
    "Recibí tu mensaje:",
    "",
    `> ${userContent}`,
    "",
    "Esta es una **respuesta simulada** del mock de AGIChat."
  ].join("\n");

const defaultCreateId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

/**
 * Adaptador de transporte simulado: implementa el puerto `ITransportAdapter`
 * de `@agichat/core` para poder desarrollar y probar la UI sin un agente
 * real. En el Proyecto #2 se sustituye por un adaptador real (HTTP/WS) sin
 * tocar ChatWidget, MessageBubble, InputBar ni useChat.
 */
export class MockTransportAdapter implements ITransportAdapter {
  private readonly handlers = new Set<TransportEventHandler>();
  private readonly typingDelayMs: number;
  private readonly replyDelayMs: number;
  private readonly createReply: (userContent: string) => string;
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

  public constructor(options: MockTransportAdapterOptions = {}) {
    this.typingDelayMs = options.typingDelayMs ?? 300;
    this.replyDelayMs = options.replyDelayMs ?? 900;
    this.createReply = options.createReply ?? defaultCreateReply;
    this.createId = options.createId ?? defaultCreateId;
    this.now = options.now ?? (() => new Date());
  }

  public sendMessage(content: string): Promise<void> {
    this.scheduleTypingAndReply(content);
    return Promise.resolve();
  }

  public subscribe(handler: TransportEventHandler): () => void {
    this.handlers.add(handler);

    return () => {
      this.handlers.delete(handler);
    };
  }

  public dispose(): void {
    for (const timeout of this.pendingTimeouts) {
      clearTimeout(timeout);
    }

    this.pendingTimeouts.clear();
    this.handlers.clear();
  }

  private scheduleTypingAndReply(userContent: string): void {
    this.runAfter(this.typingDelayMs, () => {
      this.emit({ type: "agent-typing", isTyping: true });

      this.runAfter(this.replyDelayMs, () => {
        this.emit({ type: "agent-typing", isTyping: false });
        this.emit({
          type: "agent-message",
          message: {
            id: this.createId(),
            content: this.createReply(userContent),
            timestamp: this.now()
          }
        });
      });
    });
  }

  private runAfter(delayMs: number, callback: () => void): void {
    const timeout = setTimeout(() => {
      this.pendingTimeouts.delete(timeout);
      callback();
    }, delayMs);

    this.pendingTimeouts.add(timeout);
  }

  private emit(event: TransportEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}
