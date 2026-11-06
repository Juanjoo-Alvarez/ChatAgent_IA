import type { CacheStore } from "./types";

export interface ReadThroughCacheOptions {
  /** Errores del almacenamiento; la caché nunca impide responder. */
  readonly onStoreError?: (error: unknown, operation: "get" | "set" | "delete") => void;
}

export interface CacheLoadOptions<T> {
  readonly ttlMs: number;
  /** Permite descartar resultados degradados aunque la carga haya tenido éxito. */
  readonly shouldCache?: (value: T) => boolean;
}

/**
 * Lee de la caché y, si no hay un valor vigente, ejecuta la carga y guarda su
 * resultado. Las cargas que fallan nunca se guardan. Solicitudes concurrentes
 * con la misma clave dentro de una réplica comparten una sola carga.
 */
export class ReadThroughCache {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly onStoreError: NonNullable<ReadThroughCacheOptions["onStoreError"]>;

  public constructor(
    private readonly store: CacheStore,
    options: ReadThroughCacheOptions = {}
  ) {
    this.onStoreError = options.onStoreError ?? (() => undefined);
  }

  public getOrLoad<T>(key: string, load: () => Promise<T>, options: CacheLoadOptions<T>): Promise<T> {
    const pending = this.inflight.get(key);
    if (pending !== undefined) {
      return pending as Promise<T>;
    }

    const promise = this.resolve(key, load, options).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  public invalidate(key: string): Promise<void> {
    return this.store.delete(key).catch((error: unknown) => this.onStoreError(error, "delete"));
  }

  public invalidatePrefix(prefix: string): Promise<number> {
    return this.store.deleteByPrefix(prefix);
  }

  private async resolve<T>(key: string, load: () => Promise<T>, options: CacheLoadOptions<T>): Promise<T> {
    const cached = await this.store.get(key).catch((error: unknown) => {
      this.onStoreError(error, "get");
      return null;
    });

    if (cached !== null) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // Un valor corrupto se descarta y se vuelve a cargar.
        await this.invalidate(key);
      }
    }

    const value = await load();
    if (options.shouldCache?.(value) ?? true) {
      await this.store
        .set(key, JSON.stringify(value), options.ttlMs)
        .catch((error: unknown) => this.onStoreError(error, "set"));
    }
    return value;
  }
}
