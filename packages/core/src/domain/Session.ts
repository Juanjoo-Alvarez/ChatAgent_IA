// El metadata permite transportar contexto del cliente sin acoplar el dominio
// a una forma específica de datos.
export type SessionMetadata = Readonly<Record<string, unknown>>;

export interface SessionProps {
  readonly id: string;
  readonly metadata?: SessionMetadata;
}

/** Identifica una conversación y transporta contexto opcional del cliente. */
export class Session {
  public readonly id: string;
  public readonly metadata: SessionMetadata | undefined;

  public constructor(props: SessionProps) {
    if (props.id.trim().length === 0) {
      throw new Error("Session id cannot be empty");
    }

    this.id = props.id;
    // La copia congelada impide que cambios externos modifiquen la sesión.
    this.metadata =
      props.metadata === undefined
        ? undefined
        : Object.freeze({ ...props.metadata });
  }
}
