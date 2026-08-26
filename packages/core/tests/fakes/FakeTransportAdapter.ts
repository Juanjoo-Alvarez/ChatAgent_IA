import type {
  ITransportAdapter,
  TransportEvent,
  TransportEventHandler
} from "../../src/ports/ITransportAdapter";

export interface DeferredSend {
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

export class FakeTransportAdapter implements ITransportAdapter {
  public readonly sentContents: string[] = [];

  private readonly handlers = new Set<TransportEventHandler>();
  private readonly queuedSends: Array<() => Promise<void>> = [];

  public sendMessage(content: string): Promise<void> {
    this.sentContents.push(content);
    const queuedSend = this.queuedSends.shift();
    return queuedSend?.() ?? Promise.resolve();
  }

  public subscribe(handler: TransportEventHandler): () => void {
    this.handlers.add(handler);

    return () => {
      this.handlers.delete(handler);
    };
  }

  public emit(event: TransportEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  public failNextSend(error: unknown): void {
    this.queuedSends.push(() => Promise.reject(error));
  }

  public deferNextSend(): DeferredSend {
    let resolvePromise: (() => void) | undefined;
    let rejectPromise: ((error: unknown) => void) | undefined;

    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    this.queuedSends.push(() => promise);

    return {
      resolve: () => resolvePromise?.(),
      reject: (error: unknown) => rejectPromise?.(error)
    };
  }

  public get subscriberCount(): number {
    return this.handlers.size;
  }
}
