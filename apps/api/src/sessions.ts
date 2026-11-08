import type { AgentMessageFrame } from "@agichat/protocol";

export interface SavedTurn {
  readonly requestId: string;
  readonly fingerprint: string;
  readonly user: string;
  readonly frame: AgentMessageFrame;
}
export interface Session { readonly tokenHash: string; readonly turns: readonly SavedTurn[] }
export interface SessionStore {
  create(id: string, tokenHash: string, ttlMs: number): Promise<void>;
  get(id: string): Promise<Session | null>;
  acquire(id: string, tokenHash: string, owner: string, leaseMs: number): Promise<boolean>;
  commit(id: string, owner: string, turn: SavedTurn, ttlMs: number): Promise<boolean>;
  release(id: string, owner: string): Promise<void>;
}

/** Desarrollo o una sola réplica. Expiración y tamaño acotados, sin temporizadores. */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, { session: Session; expiresAt: number; owner: string | null; lockUntil: number }>();
  public constructor(private readonly now: () => number = Date.now, private readonly capacity = 1000) {}

  public async create(id: string, tokenHash: string, ttlMs: number): Promise<void> {
    for (const [key, entry] of this.sessions) {
      if (entry.expiresAt <= this.now()) { this.sessions.delete(key); }
    }
    if (this.sessions.size >= this.capacity || this.sessions.has(id)) { throw new Error("session_capacity"); }
    this.sessions.set(id, { session: { tokenHash, turns: [] }, expiresAt: this.now() + ttlMs, owner: null, lockUntil: 0 });
  }
  public async get(id: string): Promise<Session | null> {
    const entry = this.sessions.get(id);
    if (entry === undefined) { return null; }
    if (entry.expiresAt <= this.now()) { this.sessions.delete(id); return null; }
    return structuredClone(entry.session);
  }
  public async acquire(id: string, tokenHash: string, owner: string, leaseMs: number): Promise<boolean> {
    const entry = this.sessions.get(id);
    if (entry === undefined || entry.expiresAt <= this.now() || entry.session.tokenHash !== tokenHash || entry.lockUntil > this.now()) { return false; }
    entry.owner = owner;
    entry.lockUntil = this.now() + leaseMs;
    return true;
  }
  public async commit(id: string, owner: string, turn: SavedTurn, ttlMs: number): Promise<boolean> {
    const entry = this.sessions.get(id);
    if (entry === undefined || entry.expiresAt <= this.now() || entry.owner !== owner || entry.lockUntil <= this.now()) { return false; }
    entry.session = { tokenHash: entry.session.tokenHash, turns: [...entry.session.turns, structuredClone(turn)].slice(-20) };
    entry.expiresAt = this.now() + ttlMs;
    return true;
  }
  public async release(id: string, owner: string): Promise<void> {
    const entry = this.sessions.get(id);
    if (entry?.owner === owner) { entry.owner = null; entry.lockUntil = 0; }
  }
}
