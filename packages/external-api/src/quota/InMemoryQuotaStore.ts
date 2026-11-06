import {
  toWindowUsage,
  type QuotaAcquireResult,
  type QuotaStore,
  type QuotaWindow,
  type QuotaWindowUsage
} from "./types";

interface Entry {
  readonly leaseId: string;
  readonly at: number;
}

export interface InMemoryQuotaStoreOptions {
  readonly now?: () => number;
}

/**
 * Misma semántica que `RedisQuotaStore`, pero limitada a un proceso. Sirve
 * para pruebas y despliegues de una sola réplica; no coordina réplicas.
 */
export class InMemoryQuotaStore implements QuotaStore {
  private readonly entries = new Map<string, Entry[]>();
  private readonly now: () => number;

  public constructor(options: InMemoryQuotaStoreOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  public tryAcquire(
    provider: string,
    windows: readonly QuotaWindow[],
    leaseId: string
  ): Promise<QuotaAcquireResult> {
    const now = this.now();
    const live = windows.map((window) => this.prune(provider, window, now));
    let retryAfterMs = 0;
    let blocked = false;

    windows.forEach((window, index) => {
      const entries = live[index] ?? [];
      if (entries.length >= window.limit) {
        blocked = true;
        const oldest = entries[0];
        const wait = oldest === undefined ? window.windowMs : oldest.at + window.windowMs - now;
        retryAfterMs = Math.max(retryAfterMs, wait, 1);
      }
    });

    if (blocked) {
      return Promise.resolve({
        allowed: false,
        retryAfterMs,
        windows: this.toUsage(windows, live)
      });
    }

    for (const entries of live) {
      entries.push({ leaseId, at: now });
    }
    return Promise.resolve({ allowed: true, retryAfterMs: 0, windows: this.toUsage(windows, live) });
  }

  public release(provider: string, windows: readonly QuotaWindow[], leaseId: string): Promise<void> {
    for (const window of windows) {
      const key = this.key(provider, window);
      const entries = this.entries.get(key);
      if (entries !== undefined) {
        this.entries.set(
          key,
          entries.filter((entry) => entry.leaseId !== leaseId)
        );
      }
    }
    return Promise.resolve();
  }

  public usage(provider: string, windows: readonly QuotaWindow[]): Promise<readonly QuotaWindowUsage[]> {
    const now = this.now();
    const live = windows.map((window) => this.prune(provider, window, now));
    return Promise.resolve(this.toUsage(windows, live));
  }

  private prune(provider: string, window: QuotaWindow, now: number): Entry[] {
    const key = this.key(provider, window);
    const entries = (this.entries.get(key) ?? []).filter((entry) => entry.at > now - window.windowMs);
    this.entries.set(key, entries);
    return entries;
  }

  private toUsage(windows: readonly QuotaWindow[], live: readonly Entry[][]): QuotaWindowUsage[] {
    return windows.map((window, index) => toWindowUsage(window, live[index]?.length ?? 0));
  }

  private key(provider: string, window: QuotaWindow): string {
    return `${provider}:${window.windowMs}`;
  }
}
