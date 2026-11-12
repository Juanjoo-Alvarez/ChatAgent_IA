import type { MessageReference, TransportAction } from "@agichat/core";
import { referenceSchema, referenceUrl, type Reference } from "@agichat/protocol";

export interface ReferenceWindow {
  opener: unknown;
  readonly closed: boolean;
  readonly location: { replace(url: string): void };
  close(): void;
}

/** Reserva una pestaña durante el gesto del usuario, antes de cualquier await. */
export class ReferenceNavigator {
  private pending: { window: ReferenceWindow; reference: Reference } | undefined;
  private readonly handled = new Set<string>();

  public constructor(private readonly open: () => ReferenceWindow | null = () => window.open("about:blank", "_blank")) {}

  public begin(text: string, known: readonly MessageReference[]): void {
    this.finish();
    const match = /^(?:por favor[, ]+)?(?:abre|abrir|open)\s+(imdb|google\s+books)(?:\s+([\w-]+))?[.!?]?$/i.exec(text.trim());
    if (match === null) { return; }
    const provider = match[1]?.toLowerCase() === "imdb" ? "imdb" : "google-books";
    const candidates = new Map<string, Reference>();
    for (const value of known) {
      const reference = referenceSchema.safeParse(value);
      if (reference.success && reference.data.provider === provider && (match[2] === undefined || value.id === match[2])) {
        candidates.set(value.id, reference.data);
      }
    }
    if (candidates.size !== 1) { return; }
    const reference = candidates.values().next().value!;
    const reserved = this.open();
    if (reserved === null) { throw new Error("Permite las ventanas emergentes para este sitio y vuelve a pedir abrir la referencia."); }
    this.pending = { window: reserved, reference };
    try { reserved.opener = null; }
    catch { this.finish(); throw new Error("No se pudo preparar la pestaña de referencia."); }
  }

  public accept(event: TransportAction): void {
    const pending = this.pending;
    const parsed = referenceSchema.safeParse(event.action.reference);
    if (pending === undefined || event.action.type !== "open-reference" || !parsed.success
      || parsed.data.provider !== pending.reference.provider || parsed.data.id !== pending.reference.id
      || this.handled.has(event.requestId)) { return; }
    if (pending.window.closed) { this.pending = undefined; return; }
    try {
      pending.window.location.replace(referenceUrl(parsed.data));
      this.pending = undefined;
      this.handled.add(event.requestId);
      if (this.handled.size > 20) { this.handled.delete(this.handled.values().next().value!); }
    } catch {
      this.finish();
      throw new Error("No se pudo abrir la referencia. Vuelve a solicitarla.");
    }
  }

  public finish(): void {
    const pending = this.pending;
    this.pending = undefined;
    try {
      if (pending !== undefined && !pending.window.closed) { pending.window.close(); }
    } catch { /* Una pestaña cerrada o restringida no debe interrumpir el desmontaje. */ }
  }
}
