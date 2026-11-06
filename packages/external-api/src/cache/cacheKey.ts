function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : canonicalize(item)));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

/** JSON con claves ordenadas y sin `undefined`: mismos parámetros, misma clave. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Clave legible `<namespace>:<operación>:<parámetros canónicos>`. Incluir una
 * versión en el namespace (por ejemplo `tmdb:v1`) permite invalidar todo un
 * contrato al cambiar su forma.
 */
export function buildCacheKey(namespace: string, operation: string, params: Readonly<Record<string, unknown>>): string {
  return `${namespace}:${operation}:${canonicalJson(params)}`;
}
