import type { RedisLike } from "../redis";
import type { CacheStore } from "./types";

export const DEFAULT_CACHE_KEY_PREFIX = "agichat:cache";

export interface RedisCacheStoreOptions {
  readonly keyPrefix?: string;
  /** Claves pedidas por iteración de SCAN al invalidar por prefijo. */
  readonly scanCount?: number;
}

/** Escapa los comodines de patrones Redis para buscar un prefijo literal. */
export function escapeRedisPattern(value: string): string {
  return value.replace(/[*?[\]\\]/g, "\\$&");
}

/** Caché compartida entre réplicas; Redis aplica la expiración de cada clave. */
export class RedisCacheStore implements CacheStore {
  private readonly keyPrefix: string;
  private readonly scanCount: number;

  public constructor(
    private readonly redis: RedisLike,
    options: RedisCacheStoreOptions = {}
  ) {
    this.keyPrefix = options.keyPrefix ?? DEFAULT_CACHE_KEY_PREFIX;
    this.scanCount = options.scanCount ?? 200;
  }

  public get(key: string): Promise<string | null> {
    return this.redis.get(this.fullKey(key));
  }

  public async set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.redis.set(this.fullKey(key), value, "PX", Math.max(1, Math.round(ttlMs)));
  }

  public async delete(key: string): Promise<void> {
    await this.redis.del(this.fullKey(key));
  }

  public async deleteByPrefix(prefix: string): Promise<number> {
    const pattern = `${escapeRedisPattern(this.fullKey(prefix))}*`;
    let cursor = "0";
    let deleted = 0;

    do {
      const [next, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", this.scanCount);
      if (keys.length > 0) {
        deleted += await this.redis.del(...keys);
      }
      cursor = next;
    } while (cursor !== "0");

    return deleted;
  }

  private fullKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }
}
