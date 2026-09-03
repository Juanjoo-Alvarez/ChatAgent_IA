import type { Message, MessageStatus } from "./Message";

export class Conversation {
  private readonly messagesById = new Map<string, Message>();
  private orderedMessages: Message[] = [];

  public constructor(initialMessages: readonly Message[] = []) {
    for (const message of initialMessages) {
      this.addMessage(message);
    }
  }

  public getMessages(): readonly Message[] {
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
    this.orderedMessages = this.orderedMessages.map((message) =>
      message.id === messageId ? updatedMessage : message
    );

    return updatedMessage;
  }
}
