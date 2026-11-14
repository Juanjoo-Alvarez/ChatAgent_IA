import { referenceSchema, type Reference } from "./protocol.js";

export interface ReferenceRequest {
  readonly requested: boolean;
  readonly reference: Reference | null;
}

/** Gramática compartida por cliente y servidor: solo peticiones directas del usuario. */
export function resolveReferenceRequest(content: string, known: readonly unknown[], explicit?: Reference): ReferenceRequest {
  const unique = new Map<string, Reference>();
  for (const value of known) {
    const parsed = referenceSchema.safeParse(value);
    if (parsed.success) { unique.set(`${parsed.data.provider}:${parsed.data.id}`, parsed.data); }
  }
  const references = [...unique.values()];
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
  const normalized = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const request = /^(?:¿\s*)?(?:por favor[,\s]+)?(?:abre|abrir|open|(?:puedes|podrias)\s+abrir|(?:can|could|would)\s+you\s+open)\s+(.+?)(?:(?:,\s*|\s+)por favor)?[.!?]*$/i.exec(normalized);
  if (request === null) { return { requested: false, reference: null }; }
  const target = request[1]!.trim();
  if (/^(?:imdb\s+(?:y|e|and)\s+google\s+books|google\s+books\s+(?:y|e|and)\s+imdb)$/i.test(target)) {
    return { requested: true, reference: null };
  }
  const selection = /^(imdb|google\s+books)(?:\s+([A-Za-z0-9_-]+))?$/i.exec(target);
  if (selection === null) { return { requested: false, reference: null }; }
  const provider = selection[1]!.toLowerCase() === "imdb" ? "imdb" : "google-books";
  const matches = references.filter((reference) => reference.provider === provider
    && (selection[2] === undefined || reference.id === selection[2]));
  return { requested: true, reference: matches.length === 1 ? matches[0]! : null };
}
