import { Conversation } from "./domain/Conversation";
import { Message } from "./domain/Message";
import type { Session } from "./domain/Session";
import type {
  ITransportAdapter,
  TransportEvent,
  ConnectionStatus,
  TransportAction
} from "./ports/ITransportAdapter";

export interface ChatEngineState {
  readonly session: Session;
  readonly messages: readonly Message[];
  readonly isAgentTyping: boolean;
  readonly connectionStatus: ConnectionStatus;
  readonly capabilityNotice: string | null;
  readonly mode: string | null;
  readonly transportError: Error | null;
}

export interface ChatEngineOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export type MessagesChangeHandler = (
  messages: readonly Message[]
) => void;

export type StateChangeHandler = (state: ChatEngineState) => void;
export type ActionHandler = (event: TransportAction) => void;

const defaultCreateId = (): string => {
  // randomUUID es la opción preferida cuando el entorno la ofrece.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

/**
 * Orquesta el estado del chat sin depender de React ni de un transporte
 * concreto. La UI solo observa snapshots y envía comandos a este motor.
 */
export class ChatEngine {
  private readonly conversation: Conversation;
  private readonly messagesChangeHandlers = new Set<MessagesChangeHandler>();
  private readonly stateChangeHandlers = new Set<StateChangeHandler>();
  private readonly actionHandlers = new Set<ActionHandler>();
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly unsubscribeTransport: () => void;

  private agentTyping = false;
  private connectionStatus: ConnectionStatus = "idle";
  private capabilityNotice: string | null = null;
  private mode: string | null = null;
  private transportError: Error | null = null;
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

    // El mensaje aparece de inmediato como "sending"; la confirmación del
    // transporte decide después si termina en "sent" o "error".
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
    // Se entrega un snapshot completo para simplificar la sincronización de UI.
    return {
      session: this.session,
      messages: this.getMessages(),
      isAgentTyping: this.agentTyping,
      connectionStatus: this.connectionStatus,
      capabilityNotice: this.capabilityNotice,
      mode: this.mode,
      transportError: this.transportError
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
    // El suscriptor recibe el estado actual sin esperar al próximo evento.
    handler(this.getState());

    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  public onAction(handler: ActionHandler): () => void {
    this.ensureActive();
    this.actionHandlers.add(handler);
    return () => { this.actionHandlers.delete(handler); };
  }

  public dispose(): void {
    // dispose es idempotente para permitir limpiezas repetidas con seguridad.
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.unsubscribeTransport();
    this.messagesChangeHandlers.clear();
    this.stateChangeHandlers.clear();
    this.actionHandlers.clear();
  }

  private handleTransportEvent(event: TransportEvent): void {
    if (this.disposed) {
      return;
    }

    if (event.type === "action") {
      for (const handler of this.actionHandlers) { handler(event); }
      return;
    }
    if (event.type === "connection-state") {
      this.connectionStatus = event.status;
      if (event.status === "disconnected") { this.agentTyping = false; }
      this.notifyState();
      return;
    }
    if (event.type === "session-ready") {
      this.capabilityNotice = event.notice;
      this.mode = event.mode;
      this.transportError = null;
      this.notifyState();
      return;
    }
    if (event.type === "transport-error") {
      this.transportError = event.error;
      this.agentTyping = false;
      this.notifyState();
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

    // Un mensaje entrante también finaliza el indicador de escritura para
    // mantener consistente el estado aunque el adaptador no emita el cierre.
    this.agentTyping = false;
    this.conversation.addMessage(
      new Message({
        id: event.message.id,
        role: "agent",
        content: event.message.content,
        timestamp: event.message.timestamp,
        status: "sent",
        ...(event.message.cards === undefined ? {} : { cards: event.message.cards }),
        ...(event.message.references === undefined ? {} : { references: event.message.references })
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
