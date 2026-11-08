import { vi } from "vitest";

import type { LanguageModel, ModelReply, ToolGateway, ToolSession } from "../src/index.js";

export const movie = {
  id: 501, title: "Marea alta", year: 2018,
  poster: "https://image.tmdb.org/t/p/w500/marea.jpg", imdb_id: "tt9950101",
  overview: "Un pueblo espera la tormenta."
};
export function fixtures(replies: ModelReply[] = [{ content: "Te recomiendo Marea alta por su atmósfera.", toolCalls: [] }]) {
  let index = 0;
  const model: LanguageModel = { complete: vi.fn(async () => replies[Math.min(index++, replies.length - 1)] as ModelReply) };
  const session: ToolSession = {
    tools: [{ name: "recommend_movies", description: "Candidatos", inputSchema: { type: "object" } }],
    call: vi.fn(async () => ({ data: { candidates: [movie] }, isError: false })),
    close: vi.fn(async () => undefined)
  };
  const gateway: ToolGateway = { open: vi.fn(async () => session) };
  return { model, session, gateway };
}
export const recommendCall = { content: "", toolCalls: [{ name: "recommend_movies", arguments: {} }] };
export const signal = () => new AbortController().signal;
