import type { RedisLike } from "../redis";
import {
  toWindowUsage,
  type QuotaAcquireResult,
  type QuotaStore,
  type QuotaWindow,
  type QuotaWindowUsage
} from "./types";

// Cada ventana es un sorted set cuyos miembros son los IDs de cada solicitud y
// cuyo score es el instante en que se registró. La hora se toma de Redis
// (TIME), no de cada réplica, para que relojes desfasados no alteren el límite.
// Los scripts Lua se ejecutan de forma atómica: entre la verificación y el
// registro ninguna otra réplica puede incrementar el contador.

const NOW_MS = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
`;

const ACQUIRE_SCRIPT = `${NOW_MS}
local used = {}
local blocked = false
local retry = 0
for i = 1, #KEYS do
  local limit = tonumber(ARGV[2 * i])
  local window = tonumber(ARGV[2 * i + 1])
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - window)
  local count = redis.call('ZCARD', KEYS[i])
  used[i] = count
  if count >= limit then
    blocked = true
    local wait = window
    local oldest = redis.call('ZRANGE', KEYS[i], 0, 0, 'WITHSCORES')
    if oldest[2] then
      wait = tonumber(oldest[2]) + window - now
    end
    if wait < 1 then
      wait = 1
    end
    if wait > retry then
      retry = wait
    end
  end
end
if blocked then
  return {0, retry, unpack(used)}
end
for i = 1, #KEYS do
  local window = tonumber(ARGV[2 * i + 1])
  redis.call('ZADD', KEYS[i], now, ARGV[1])
  redis.call('PEXPIRE', KEYS[i], window)
  used[i] = used[i] + 1
end
return {1, 0, unpack(used)}
`;

const RELEASE_SCRIPT = `
for i = 1, #KEYS do
  redis.call('ZREM', KEYS[i], ARGV[1])
end
return 1
`;

const USAGE_SCRIPT = `${NOW_MS}
local used = {}
for i = 1, #KEYS do
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - tonumber(ARGV[i]))
  used[i] = redis.call('ZCARD', KEYS[i])
end
return used
`;

export const DEFAULT_QUOTA_KEY_PREFIX = "agichat:quota";

export interface RedisQuotaStoreOptions {
  readonly keyPrefix?: string;
}

function toNumbers(reply: unknown, expected: number): number[] {
  if (!Array.isArray(reply) || reply.length !== expected) {
    throw new TypeError("Unexpected reply from the Redis quota script");
  }
  return reply.map((value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new TypeError("Unexpected reply from the Redis quota script");
    }
    return number;
  });
}

/** Contadores compartidos entre réplicas mediante Redis. */
export class RedisQuotaStore implements QuotaStore {
  private readonly keyPrefix: string;

  public constructor(
    private readonly redis: RedisLike,
    options: RedisQuotaStoreOptions = {}
  ) {
    this.keyPrefix = options.keyPrefix ?? DEFAULT_QUOTA_KEY_PREFIX;
  }

  public async tryAcquire(
    provider: string,
    windows: readonly QuotaWindow[],
    leaseId: string
  ): Promise<QuotaAcquireResult> {
    const args = windows.flatMap((window) => [window.limit, window.windowMs]);
    const reply = await this.redis.eval(
      ACQUIRE_SCRIPT,
      windows.length,
      ...this.keys(provider, windows),
      leaseId,
      ...args
    );
    const [allowed, retryAfterMs, ...used] = toNumbers(reply, windows.length + 2);

    return {
      allowed: allowed === 1,
      retryAfterMs: retryAfterMs ?? 0,
      windows: windows.map((window, index) => toWindowUsage(window, used[index] ?? 0))
    };
  }

  public async release(provider: string, windows: readonly QuotaWindow[], leaseId: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, windows.length, ...this.keys(provider, windows), leaseId);
  }

  public async usage(provider: string, windows: readonly QuotaWindow[]): Promise<readonly QuotaWindowUsage[]> {
    const reply = await this.redis.eval(
      USAGE_SCRIPT,
      windows.length,
      ...this.keys(provider, windows),
      ...windows.map((window) => window.windowMs)
    );
    const used = toNumbers(reply, windows.length);
    return windows.map((window, index) => toWindowUsage(window, used[index] ?? 0));
  }

  private keys(provider: string, windows: readonly QuotaWindow[]): string[] {
    return windows.map((window) => `${this.keyPrefix}:${provider}:${window.windowMs}`);
  }
}
