import type { Reference } from "@agichat/protocol";

/** Resuelve solicitudes de apertura únicamente sobre referencias ya vistas por el usuario. */
export function resolveReferenceRequest(content: string, known: readonly Reference[], explicit?: Reference): { requested: boolean; reference: Reference | null } {
  const unique = [...new Map(known.map((reference) => [`${reference.provider}:${reference.id}`, reference])).values()];
  if (explicit !== undefined) {
    return { requested: true, reference: unique.find((reference) => reference.provider === explicit.provider && reference.id === explicit.id) ?? null };
  }
  const normalized = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "").toLowerCase();
  if (!/\b(abre|abrir|open)\b/.test(normalized) || /\b(no|nunca|not|dont)\b/.test(normalized)) {
    return { requested: false, reference: null };
  }
  const imdb = /\bimdb\b/.test(normalized);
  const books = /\bgoogle\s*books\b/.test(normalized);
  if (!imdb && !books) { return { requested: false, reference: null }; }
  if (imdb && books) { return { requested: true, reference: null }; }
  const matches = unique.filter((reference) => reference.provider === (imdb ? "imdb" : "google-books"));
  if (matches.length === 1) { return { requested: true, reference: matches[0] as Reference }; }
  const identified = matches.filter((reference) => content.includes(reference.id));
  return { requested: true, reference: identified.length === 1 ? identified[0] as Reference : null };
}
