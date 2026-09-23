// Roles admitidos por la conversación.
export type MessageRole = "user" | "agent";

// Estados posibles durante el envío de un mensaje.
export type MessageStatus = "sending" | "sent" | "error";

export interface MessageProps {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: Date;
  readonly status: MessageStatus;
}

const ALLOWED_TRANSITIONS: Readonly<
  Record<MessageStatus, readonly MessageStatus[]>
> = {
  // Un envío pendiente solo puede confirmarse o terminar con error.
  sending: ["sent", "error"],
  // Los estados finales no admiten nuevas transiciones.
  sent: [],
  error: []
};

/** Mensaje inmutable con transiciones de estado controladas por el dominio. */
export class Message {
  public readonly id: string;
  public readonly role: MessageRole;
  public readonly content: string;
  public readonly status: MessageStatus;

  private readonly timestampValue: Date;

  public constructor(props: MessageProps) {
    // Los identificadores y contenidos vacíos no forman mensajes válidos.
    if (props.id.trim().length === 0) {
      throw new Error("Message id cannot be empty");
    }

    if (props.content.trim().length === 0) {
      throw new Error("Message content cannot be empty");
    }

    if (Number.isNaN(props.timestamp.getTime())) {
      throw new Error("Message timestamp must be a valid date");
    }

    this.id = props.id;
    this.role = props.role;
    this.content = props.content;
    this.timestampValue = new Date(props.timestamp.getTime());
    this.status = props.status;
  }

  public get timestamp(): Date {
    // Se devuelve una copia para que Date no rompa la inmutabilidad del mensaje.
    return new Date(this.timestampValue.getTime());
  }

  public withStatus(status: MessageStatus): Message {
    // Reutilizar la instancia evita notificaciones innecesarias si nada cambió.
    if (status === this.status) {
      return this;
    }

    if (!ALLOWED_TRANSITIONS[this.status].includes(status)) {
      throw new Error(
        `Invalid message status transition: ${this.status} -> ${status}`
      );
    }

    return new Message({
      id: this.id,
      role: this.role,
      content: this.content,
      timestamp: this.timestampValue,
      status
    });
  }
}
