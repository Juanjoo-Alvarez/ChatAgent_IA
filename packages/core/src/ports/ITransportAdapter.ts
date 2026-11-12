import type { MessageCard, MessageReference, ReferenceAction } from "../domain/MessageContent";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";

export interface IncomingAgentMessage {
  readonly id: string;
  readonly content: string;
  readonly timestamp: Date;
  readonly cards?: readonly MessageCard[];
  readonly references?: readonly MessageReference[];
}

export interface TransportAction {
  readonly requestId: string;
  readonly action: ReferenceAction;
}

export type TransportEvent =
  | {
      readonly type: "agent-message";
      readonly message: IncomingAgentMessage;
    }
  | {
      readonly type: "agent-typing";
      readonly isTyping: boolean;
    }
  | { readonly type: "connection-state"; readonly status: ConnectionStatus }
  | { readonly type: "session-ready"; readonly notice: string; readonly mode: string }
  | { readonly type: "transport-error"; readonly error: Error }
  | ({ readonly type: "action" } & TransportAction);

export type TransportEventHandler = (event: TransportEvent) => void;

/**
 * Puerto que separa el dominio de cualquier mecanismo de comunicación.
 * Un adaptador puede usar un mock, WebSocket u otro backend sin cambiar Core.
 */
export interface ITransportAdapter {
  sendMessage(content: string): Promise<void>;
  subscribe(handler: TransportEventHandler): () => void;
}
