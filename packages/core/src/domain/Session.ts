export type SessionMetadata = Readonly<Record<string, unknown>>;

export interface SessionProps {
  readonly id: string;
  readonly metadata?: SessionMetadata;
}

export class Session {
  public readonly id: string;
  public readonly metadata: SessionMetadata | undefined;

  public constructor(props: SessionProps) {
    if (props.id.trim().length === 0) {
      throw new Error("Session id cannot be empty");
    }

    this.id = props.id;
    this.metadata =
      props.metadata === undefined
        ? undefined
        : Object.freeze({ ...props.metadata });
  }
}
