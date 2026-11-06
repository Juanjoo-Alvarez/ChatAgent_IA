/**
 * Subconjunto de comandos Redis que usan las implementaciones compartidas.
 * Un cliente `ioredis` cumple esta interfaz; el paquete no depende de él en
 * tiempo de ejecución, así cada aplicación decide cómo conectarse.
 */
export interface RedisLike {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "PX", ttlMs: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  scan(
    cursor: string,
    match: "MATCH",
    pattern: string,
    count: "COUNT",
    size: number
  ): Promise<[cursor: string, keys: string[]]>;
}
