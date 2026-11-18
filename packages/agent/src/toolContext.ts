/** Acota las páginas y sinopsis antes de medir el resultado. Nunca recorta IDs ni fuentes. */
export function compactResult(data: unknown, key = ""): unknown {
  if (typeof data === "string" && ["description", "overview"].includes(key)) { return data.slice(0, 800); }
  if (Array.isArray(data)) {
    return (key === "results" || key === "candidates" ? data.slice(0, 5) : data).map((value) => compactResult(value, key));
  }
  if (typeof data !== "object" || data === null) { return data; }
  return Object.fromEntries(Object.entries(data).map(([name, value]) => [name, compactResult(value, name)]));
}

/** Reduce metadatos de presentación; conserva afirmaciones, fuentes y límites.
 * Las tarjetas y referencias se extraen del resultado completo antes de esta proyección.
 */
export function toolContext(data: unknown): unknown {
  if (Array.isArray(data)) { return data.map(toolContext); }
  if (typeof data !== "object" || data === null) { return data; }
  return Object.fromEntries(Object.entries(data)
    .filter(([key]) => !["poster", "tmdb_url", "url", "identifiers", "content_notice"].includes(key))
    .map(([key, value]) => [key, toolContext(value)]));
}

export function isCompletedComparison(name: string, data: unknown): boolean {
  if (name !== "compare_movie_book" || typeof data !== "object" || data === null) { return false; }
  const result = data as Record<string, unknown>;
  // Una coincidencia incierta todavía puede necesitar búsqueda o aclaración.
  return result.status === "adaptation_identified";
}
