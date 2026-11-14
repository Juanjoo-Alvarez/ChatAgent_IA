import type { AgentReply, ChatAgent } from "@agichat/agent";
import { resolveReferenceRequest } from "@agichat/agent";
import { vi } from "vitest";

export const imdb = { provider: "imdb" as const, id: "tt1234567" };
export const book = { provider: "google-books" as const, id: "volume_1" };
export const movieReply: AgentReply = {
  content: "Película de prueba para esta conversación.",
  movies: [{ id: 1, title: "Adaptación de prueba", year: 2020, poster: "https://image.tmdb.org/t/p/w500/test.jpg", imdbId: imdb.id }],
  references: [imdb], actions: []
};

/** Doble del agente, sin LLM ni consultas a proveedores; la API y el SDK son reales. */
export function journeyAgent() {
  return { respond: vi.fn<ChatAgent["respond"]>(async ({ content, history }) => {
    if (content === "Compárala con el libro") {
      return { content: "Comparación de prueba con evidencia limitada.", movies: [], references: [book], actions: [] };
    }
    const { reference } = resolveReferenceRequest(content, history.flatMap((turn) => turn.references));
    if (reference !== null) {
      return { content: "Abriendo la referencia solicitada.", movies: [], references: [reference], actions: [{ type: "open-reference", reference }] };
    }
    return movieReply;
  }) };
}
