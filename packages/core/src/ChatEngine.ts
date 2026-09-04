import { Conversation } from "./domain/Conversation";
import { Message } from "./domain/Message";
import type { Session } from "./domain/Session";
import type {
  ITransportAdapter,
  TransportEvent
} from "./ports/ITransportAdapter";

export interface ChatEngineState {
  readonly session: Session;
  readonly messages: readonly Message[];
  readonly isAgentTyping: boolean;
}

export interface ChatEngineOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export type MessagesChangeHandler = (
  messages: readonly Message[]
) => void;

export type StateChangeHandler = (state: ChatEngineState) => void;

const defaultCreateId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export class ChatEngine {
  private readonly conversation: Conversation;
  private readonly messagesChangeHandlers = new Set<MessagesChangeHandler>();
  private readonly stateChangeHandlers = new Set<StateChangeHandler>();
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly unsubscribeTransport: () => void;

  private agentTyping = false;
  private disposed = false;

  public constructor(
    public readonly session: Session,
    private readonly transport: ITransportAdapter,
    options: ChatEngineOptions = {}
  ) {
    this.conversation = new Conversation();
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultCreateId;
    this.unsubscribeTransport = this.transport.subscribe((event) => {
      this.handleTransportEvent(event);
    });
  }

  public async sendUserMessage(text: string): Promise<Message> {
    this.ensureActive();

    const message = new Message({
      id: this.createId(),
      role: "user",
      content: text,
      timestamp: this.now(),
      status: "sending"
    });

    this.conversation.addMessage(message);
    this.notifyMessagesAndState();

    try {
      await this.transport.sendMessage(text);
      const sentMessage = this.conversation.updateMessageStatus(
        message.id,
        "sent"
      );
      this.notifyMessagesAndState();
      return sentMessage;
    } catch (error: unknown) {
      this.conversation.updateMessageStatus(message.id, "error");
      this.notifyMessagesAndState();
      throw error;
    }
  }

  public getMessages(): readonly Message[] {
    return this.conversation.getMessages();
  }

  public getState(): ChatEngineState {
    return {
      session: this.session,
      messages: this.getMessages(),
      isAgentTyping: this.agentTyping
    };
  }

  public onMessagesChange(handler: MessagesChangeHandler): () => void {
    this.ensureActive();
    this.messagesChangeHandlers.add(handler);
    handler(this.getMessages());

    return () => {
      this.messagesChangeHandlers.delete(handler);
    };
  }

  public onStateChange(handler: StateChangeHandler): () => void {
    this.ensureActive();
    this.stateChangeHandlers.add(handler);
    handler(this.getState());

    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.unsubscribeTransport();
    this.messagesChangeHandlers.clear();
    this.stateChangeHandlers.clear();
  }

  private handleTransportEvent(event: TransportEvent): void {
    if (this.disposed) {
      return;
    }

    if (event.type === "agent-typing") {
      if (this.agentTyping === event.isTyping) {
        return;
      }

      this.agentTyping = event.isTyping;
      this.notifyState();
      return;
    }

    this.agentTyping = false;
    this.conversation.addMessage(
      new Message({
        id: event.message.id,
        role: "agent",
        content: event.message.content,
        timestamp: event.message.timestamp,
        status: "sent"
      })
    );
    this.notifyMessagesAndState();
  }

  private notifyMessagesAndState(): void {
    const messages = this.getMessages();

    for (const handler of this.messagesChangeHandlers) {
      handler(messages);
    }

    this.notifyState();
  }

  private notifyState(): void {
    const state = this.getState();

    for (const handler of this.stateChangeHandlers) {
      handler(state);
    }
  }

  private ensureActive(): void {
    if (this.disposed) {
      throw new Error("ChatEngine has been disposed");
    }
  }
}
