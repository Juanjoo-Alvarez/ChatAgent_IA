import type { SavedTurn } from "../src/sessions.js";

export const turn: SavedTurn = {
  requestId: "44e4c186-38a3-4fd1-9b91-64fa39ef1966", fingerprint: "fingerprint", user: "Hola",
  context: { movies: [{ id: 438631, title: "Dune", year: 2021, poster: null, imdbId: "tt1160419" }], books: [{ id: "Dune_Book", title: "Dune", authors: ["Frank Herbert", "Editor"] }] },
  frame: {
    version: 1, type: "agent-message", requestId: "44e4c186-38a3-4fd1-9b91-64fa39ef1966",
    message: { id: "44e4c186-38a3-4fd1-9b91-64fa39ef1966", content: "Hola", timestamp: "2026-11-08T10:00:00.000Z" },
    movies: [], references: [], actions: []
  }
};
