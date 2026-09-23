import type { Message, MessageStatus } from "./Message";

/**
 * Conserva el orden de la conversación y permite buscar mensajes por id sin
 * exponer las colecciones mutables que utiliza internamente.
 */
export class Conversation {
  // El mapa ofrece búsquedas rápidas; el arreglo conserva el orden visual.
  private readonly messagesById = new Map<string, Message>();
  private orderedMessages: Message[] = [];

  public constructor(initialMessages: readonly Message[] = []) {
    // Se usa addMessage para aplicar también la validación de ids duplicados.
    for (const message of initialMessages) {
      this.addMessage(message);
    }
  }

  public getMessages(): readonly Message[] {
    // El snapshot evita que un consumidor pueda alterar el historial interno.
    return [...this.orderedMessages];
  }

  public addMessage(message: Message): void {
    if (this.messagesById.has(message.id)) {
      throw new Error(`A message with id "${message.id}" already exists`);
    }

    this.messagesById.set(message.id, message);
    this.orderedMessages = [...this.orderedMessages, message];
  }

  public updateMessageStatus(
    messageId: string,
    status: MessageStatus
  ): Message {
    const currentMessage = this.messagesById.get(messageId);

    if (currentMessage === undefined) {
      throw new Error(`Message with id "${messageId}" was not found`);
    }

    const updatedMessage = currentMessage.withStatus(status);

    if (updatedMessage === currentMessage) {
      return currentMessage;
    }

    this.messagesById.set(messageId, updatedMessage);
    // Se reemplaza el arreglo para que los observadores reciban una referencia
    // nueva y React pueda reconocer el cambio de estado.
    this.orderedMessages = this.orderedMessages.map((message) =>
      message.id === messageId ? updatedMessage : message
    );

    return updatedMessage;
  }
}
