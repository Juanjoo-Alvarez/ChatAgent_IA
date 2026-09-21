import type {
  ITransportAdapter,
  TransportEvent,
  TransportEventHandler
} from "@agichat/core";

export type MockTransportMode = "success" | "error" | "timeout";

export interface MockTransportAdapterOptions {
  readonly mode?: MockTransportMode;
  readonly sendDelayMs?: number;
  readonly typingDelayMs?: number;
  readonly replyDelayMs?: number;
  readonly timeoutMs?: number;
  readonly error?: Error;
  readonly createReply?: (userContent: string) => string;
  readonly createId?: () => string;
  readonly now?: () => Date;
}

interface PendingTimer {
  readonly handle: ReturnType<typeof setTimeout>;
  readonly cancel?: () => void;
}

const ULTIMATE_QUESTION_PATTERN =
  /(?:life.*universe.*everything|vida.*universo.*todo)/i;

const defaultCreateReply = (userContent: string): string => {
  if (ULTIMATE_QUESTION_PATTERN.test(userContent)) {
    return "42";
  }

  return [
    "Recibí tu mensaje:",
    "",
    `> ${userContent}`,
    "",
    "Esta es una **respuesta simulada** del mock de AGIChat."
  ].join("\n");
};

const defaultCreateId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const validateDelay = (name: string, value: number): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number`);
  }
};

export class MockTransportTimeoutError extends Error {
  public constructor(public readonly timeoutMs: number) {
    super(`Mock transport timed out after ${timeoutMs} ms`);
    this.name = "MockTransportTimeoutError";
  }
}

export class MockTransportDisposedError extends Error {
  public constructor() {
    super("Mock transport has been disposed");
    this.name = "MockTransportDisposedError";
  }
}

/**
 * Transporte determinista para desarrollar la UI sin un backend real.
 * Puede simular confirmaciones exitosas, errores y timeouts.
 */
export class MockTransportAdapter implements ITransportAdapter {
  private readonly handlers = new Set<TransportEventHandler>();
  private readonly mode: MockTransportMode;
  private readonly sendDelayMs: number;
  private readonly typingDelayMs: number;
  private readonly replyDelayMs: number;
  private readonly timeoutMs: number;
  private readonly error: Error;
  private readonly createReply: (userContent: string) => string;
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly pendingTimers = new Set<PendingTimer>();

  private disposed = false;

  public constructor(options: MockTransportAdapterOptions = {}) {
    this.mode = options.mode ?? "success";
    this.sendDelayMs = options.sendDelayMs ?? 0;
    this.typingDelayMs = options.typingDelayMs ?? 300;
    this.replyDelayMs = options.replyDelayMs ?? 900;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.error = options.error ?? new Error("Mock transport request failed");
    this.createReply = options.createReply ?? defaultCreateReply;
    this.createId = options.createId ?? defaultCreateId;
    this.now = options.now ?? (() => new Date());

    validateDelay("sendDelayMs", this.sendDelayMs);
    validateDelay("typingDelayMs", this.typingDelayMs);
    validateDelay("replyDelayMs", this.replyDelayMs);
    validateDelay("timeoutMs", this.timeoutMs);
  }

  public sendMessage(content: string): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new MockTransportDisposedError());
    }

    if (this.mode === "timeout") {
      if (this.timeoutMs === 0) {
        return Promise.reject(new MockTransportTimeoutError(0));
      }

      return this.rejectAfter(
        this.timeoutMs,
        () => new MockTransportTimeoutError(this.timeoutMs)
      );
    }

    if (this.mode === "error") {
      if (this.sendDelayMs === 0) {
        return Promise.reject(this.error);
      }

      return this.rejectAfter(this.sendDelayMs, () => this.error);
    }

    if (this.sendDelayMs === 0) {
      this.scheduleTypingAndReply(content);
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.runAfter(
        this.sendDelayMs,
        () => {
          this.scheduleTypingAndReply(content);
          resolve();
        },
        () => reject(new MockTransportDisposedError())
      );
    });
  }

  public subscribe(handler: TransportEventHandler): () => void {
    if (this.disposed) {
      throw new MockTransportDisposedError();
    }

    this.handlers.add(handler);

    return () => {
      this.handlers.delete(handler);
    };
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    for (const timer of this.pendingTimers) {
      clearTimeout(timer.handle);
      timer.cancel?.();
    }

    this.pendingTimers.clear();
    this.handlers.clear();
  }

  private rejectAfter(delayMs: number, createError: () => Error): Promise<void> {
    return new Promise<void>((_resolve, reject) => {
      this.runAfter(
        delayMs,
        () => reject(createError()),
        () => reject(new MockTransportDisposedError())
      );
    });
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

  private runAfter(
    delayMs: number,
    callback: () => void,
    cancel?: () => void
  ): void {
    const timer: PendingTimer = {
      handle: setTimeout(() => {
        this.pendingTimers.delete(timer);
        callback();
      }, delayMs),
      ...(cancel === undefined ? {} : { cancel })
    };

    this.pendingTimers.add(timer);
  }

  private emit(event: TransportEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}
