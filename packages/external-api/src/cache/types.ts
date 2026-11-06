/** Almacenamiento de valores serializados con expiración. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Invalida todas las claves que empiezan con el prefijo; devuelve cuántas borró. */
  deleteByPrefix(prefix: string): Promise<number>;
}
