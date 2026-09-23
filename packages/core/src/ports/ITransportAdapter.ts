export interface IncomingAgentMessage {
  readonly id: string;
  readonly content: string;
  readonly timestamp: Date;
}

export type TransportEvent =
  | {
      readonly type: "agent-message";
      readonly message: IncomingAgentMessage;
    }
  | {
      readonly type: "agent-typing";
      readonly isTyping: boolean;
    };

export type TransportEventHandler = (event: TransportEvent) => void;

/**
 * Puerto que separa el dominio de cualquier mecanismo de comunicación.
 * Un adaptador puede usar un mock, WebSocket u otro backend sin cambiar Core.
 */
export interface ITransportAdapter {
  sendMessage(content: string): Promise<void>;
  subscribe(handler: TransportEventHandler): () => void;
}
