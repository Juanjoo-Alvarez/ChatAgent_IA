import type { SavedTurn, Session, SessionStore } from "./sessions.js";

export interface SessionRedis {
  eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
}
const ACQUIRE = `
local session = redis.call('GET', KEYS[1])
if not session or cjson.decode(session).tokenHash ~= ARGV[1] then return 0 end
if redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3], 'NX') then return 1 end
return 0`;
const COMMIT = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local session = cjson.decode(raw)
table.insert(session.turns, cjson.decode(ARGV[2]))
while #session.turns > 20 do table.remove(session.turns, 1) end
redis.call('SET', KEYS[1], cjson.encode(session), 'PX', ARGV[3])
return 1`;
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

/** Las claves comparten hash tag para permitir ejecución atómica en Redis Cluster. */
export class RedisSessionStore implements SessionStore {
  public constructor(private readonly redis: SessionRedis, private readonly prefix = "agichat:chat") {}
  private key(id: string): string { return `${this.prefix}:{${id}}`; }

  public async create(id: string, tokenHash: string, ttlMs: number): Promise<void> {
    const created = await this.redis.eval("return redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')", 1,
      this.key(id), JSON.stringify({ tokenHash, turns: [] }), ttlMs);
    if (created !== "OK") { throw new Error("session_not_created"); }
  }
  public async get(id: string): Promise<Session | null> {
    const raw = await this.redis.get(this.key(id));
    if (raw === null) { return null; }
    const session = JSON.parse(raw) as Session;
    // Redis Lua representa una tabla vacía como objeto; la normalizamos al leer.
    return { tokenHash: session.tokenHash, turns: Array.isArray(session.turns) ? session.turns : [] };
  }
  public async acquire(id: string, tokenHash: string, owner: string, leaseMs: number): Promise<boolean> {
    return await this.redis.eval(ACQUIRE, 2, this.key(id), `${this.key(id)}:lock`, tokenHash, owner, leaseMs) === 1;
  }
  public async commit(id: string, owner: string, turn: SavedTurn, ttlMs: number): Promise<boolean> {
    return await this.redis.eval(COMMIT, 2, this.key(id), `${this.key(id)}:lock`, owner, JSON.stringify(turn), ttlMs) === 1;
  }
  public async release(id: string, owner: string): Promise<void> {
    await this.redis.eval(RELEASE, 1, `${this.key(id)}:lock`, owner);
  }
}
