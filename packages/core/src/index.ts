// Punto de entrada público de Core. Centralizar los exports evita que los
// consumidores dependan de la estructura interna de carpetas.
export {
  ChatEngine,
  type ChatEngineOptions,
  type ChatEngineState,
  type MessagesChangeHandler,
  type StateChangeHandler
} from "./ChatEngine";
export { Conversation } from "./domain/Conversation";
export {
  Message,
  type MessageProps,
  type MessageRole,
  type MessageStatus
} from "./domain/Message";
export {
  Session,
  type SessionMetadata,
  type SessionProps
} from "./domain/Session";
export type {
  IncomingAgentMessage,
  ITransportAdapter,
  TransportEvent,
  TransportEventHandler
} from "./ports/ITransportAdapter";
