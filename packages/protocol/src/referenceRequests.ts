import { referenceSchema, type Reference } from "./protocol.js";

export interface ReferenceRequest {
  readonly requested: boolean;
  readonly reference: Reference | null;
}

const comparable = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();

/** Gramática compartida por cliente y servidor: solo peticiones directas del usuario. */
export function resolveReferenceRequest(content: string, known: readonly unknown[], explicit?: Reference, current: readonly unknown[] = known): ReferenceRequest {
  const unique = new Map<string, Reference>();
  for (const value of known) {
    const parsed = referenceSchema.safeParse(value);
    if (parsed.success) { unique.set(`${parsed.data.provider}:${parsed.data.id}`, parsed.data); }
  }
  const references = [...unique.values()];
  const currentKeys = new Set(current.flatMap((value) => {
    const parsed = referenceSchema.safeParse(value);
    return parsed.success ? [`${parsed.data.provider}:${parsed.data.id}`] : [];
  }));
  const active = references.filter((reference) => currentKeys.has(`${reference.provider}:${reference.id}`));
  if (explicit !== undefined) {
    const parsed = referenceSchema.safeParse(explicit);
    return {
      requested: true,
      reference: parsed.success
        ? references.find((reference) => reference.provider === parsed.data.provider && reference.id === parsed.data.id) ?? null
        : null
    };
  }

  // Se normalizan las tildes, pero se conserva la capitalización de los IDs de libros.
  const normalized = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/^\d{1,2}[.)]\s+/, "");
  const request = /^(?:¿\s*)?(?:pero[,\s]+)?(?:por favor[,\s]+)?(?:abre|abreme|abrir|open|(?:me\s+)?(?:puedes|podrias)\s+abrir(?:me)?|(?:can|could|would)\s+you\s+open)\s+(.+?)(?:(?:,\s*|\s+)por favor)?[.!?]*$/i.exec(normalized);
  if (request === null) { return { requested: false, reference: null }; }
  const target = request[1]!.trim();
  if (/^(?:eso|ese enlace|esa referencia)$/i.test(target)) { return { requested: true, reference: active.length === 1 ? active[0]! : null }; }
  const destination = target.replace(/^(?:(?:la|su)\s+(?:pagina|ficha)|el\s+enlace)\s+(?:de|del|en)\s+/i, "").replace(/^en\s+/i, "");
  if (/^(?:imdb|imbd|google\s*books)\s+(?:y|e|and)\s+(?:imdb|imbd|google\s*books)$/i.test(destination)) {
    return { requested: true, reference: null };
  }
  const selection = /^(?:el\s+)?(imdb|imbd|google\s*books)(?:\s+([A-Za-z0-9_-]+)|\s+(?:de|del)\s+(.+))?$/i.exec(destination);
  if (selection === null) { return { requested: false, reference: null }; }
  const name = comparable(selection[1]!);
  const provider = /^(?:imdb|imbd)$/.test(name) ? "imdb" : "google-books";
  const requestedLabel = selection[3]?.replace(/^libro\s+(?:de\s+)?/i, "").trim() ?? null;
  const contextual = /^(?:eso|esa|ese|esta|este|ella|ello|(?:la |esa |esta )?pelicula|(?:el |ese |este )?libro|(?:(?:la |el )?(?:pelicula|libro)\s+)?que\s+(?:me\s+)?(?:mencionaste|recomendaste|acabas\s+de\s+(?:mencionar|recomendar)(?:me)?))$/i.test(selection[3] ?? selection[2] ?? "");
  const scope = contextual || (selection[2] === undefined && requestedLabel === null) ? active : references;
  const matches = scope.filter((reference) => {
    if (reference.provider !== provider) { return false; }
    if (contextual) { return true; }
    if (requestedLabel !== null) {
      const wanted = comparable(requestedLabel);
      return [reference.label, ...(reference.aliases ?? [])].some((name) => {
        if (name === undefined) { return false; }
        const label = comparable(name);
        return label === wanted || label.replace(/ \(\d{4}\)$/, "") === wanted;
      });
    }
    return selection[2] === undefined || reference.id === selection[2];
  });
  return { requested: true, reference: matches.length === 1 ? matches[0]! : null };
}

/** Conserva la obra del último resultado; abrir una ficha no cambia la selección. */
export function referenceScope(history: readonly { readonly user: string; readonly references: readonly unknown[]; readonly movies?: readonly unknown[] }[]): readonly Reference[] {
  const selected = new Map<Reference["provider"], Reference[]>();
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index]!;
    if (resolveReferenceRequest(turn.user, []).requested) { continue; }
    const references = turn.references.flatMap((reference) => {
      const parsed = referenceSchema.safeParse(reference);
      return parsed.success ? [parsed.data] : [];
    });
    for (const provider of ["imdb", "google-books"] as const) {
      const matches = references.filter((reference) => reference.provider === provider);
      if (!selected.has(provider) && matches.length) { selected.set(provider, matches); }
    }
    // Un resultado de libro puede completar la película anterior. Una película
    // nueva delimita la selección aunque TMDB no haya proporcionado IMDb.
    if (references.some((reference) => reference.provider === "imdb") || turn.movies?.length) { break; }
  }
  return [...selected.values()].flat();
}
