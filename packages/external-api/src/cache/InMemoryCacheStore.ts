import type { CacheStore } from "./types.js";

interface Entry {
  readonly value: string;
  readonly expiresAt: number;
}

export interface InMemoryCacheStoreOptions {
  readonly now?: () => number;
  /** Al superarse, se descarta la entrada más antigua. */
  readonly maxEntries?: number;
}

/** Caché local de un proceso, para pruebas o una única réplica. */
export class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  public constructor(options: InMemoryCacheStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? 1000;
  }

  public get size(): number {
    return this.entries.size;
  }

  public get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return Promise.resolve(null);
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  public set(key: string, value: string, ttlMs: number): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.entries.delete(oldest.value);
    }
    return Promise.resolve();
  }

  public delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }

  public deleteByPrefix(prefix: string): Promise<number> {
    let deleted = 0;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        deleted += 1;
      }
    }
    return Promise.resolve(deleted);
  }
}
