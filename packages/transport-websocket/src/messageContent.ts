import type { IncomingAgentMessage } from "@agichat/core";
import type { AgentMessageFrame } from "@agichat/protocol";

/** Traduce la representación de red al contenido independiente de Core. */
export function toAgentMessage(frame: AgentMessageFrame): IncomingAgentMessage {
  return {
    ...frame.message,
    timestamp: new Date(frame.message.timestamp),
    cards: frame.movies.map((movie) => ({
      id: String(movie.id), title: movie.title,
      subtitle: movie.year === null ? null : String(movie.year),
      image: movie.poster === null ? null : { url: movie.poster, alt: `Póster de ${movie.title}` }
    })),
    references: frame.references
  };
}
