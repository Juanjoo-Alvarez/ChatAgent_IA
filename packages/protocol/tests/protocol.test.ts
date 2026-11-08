import { describe, expect, it } from "vitest";

import { parseClientFrame, parseServerFrame, referenceUrl, sessionCredentialsSchema } from "../src/index.js";

const requestId = "44e4c186-38a3-4fd1-9b91-64fa39ef1966";
describe("chat wire protocol", () => {
  it("parses authentication, user requests and cancellation", () => {
    expect(parseClientFrame(JSON.stringify({ version: 1, type: "authenticate", sessionId: requestId, token: "a".repeat(43) })).type).toBe("authenticate");
    expect(parseClientFrame(JSON.stringify({ version: 1, type: "user-message", requestId, content: " Hola ", openReference: { provider: "imdb", id: "tt1234567" } }))).toMatchObject({ content: "Hola" });
    expect(parseClientFrame(JSON.stringify({ version: 1, type: "cancel", requestId })).type).toBe("cancel");
  });
  it.each([
    "not-json", JSON.stringify({ version: 2, type: "cancel", requestId }),
    JSON.stringify({ version: 1, type: "user-message", requestId, content: " " }),
    JSON.stringify({ version: 1, type: "user-message", requestId, content: "a".repeat(4001) }),
    JSON.stringify({ version: 1, type: "user-message", requestId, content: "Hola", role: "system" }),
    JSON.stringify({ version: 1, type: "authenticate", sessionId: "victim", token: "short" })
  ])("rejects malformed, oversized or privilege-bearing frames: %s", (value) => {
    expect(() => parseClientFrame(value)).toThrow();
  });
  it("constructs only approved reference destinations", () => {
    expect(referenceUrl({ provider: "imdb", id: "tt1234567" })).toBe("https://www.imdb.com/title/tt1234567/");
    expect(referenceUrl({ provider: "google-books", id: "book_-123" })).toBe("https://books.google.com/books?id=book_-123");
    expect(() => referenceUrl({ provider: "imdb", id: "https://evil.invalid" })).toThrow();
    expect(() => referenceUrl({ provider: "google-books", id: "a&redirect=evil" })).toThrow();
  });
  it("validates server messages, cards and credentials", () => {
    const frame = {
      version: 1, type: "agent-message", requestId,
      message: { id: requestId, content: "Recomendación", timestamp: "2026-11-08T10:00:00.000Z" },
      movies: [{ id: 1, title: "Película", year: 2020, poster: "https://image.tmdb.org/t/p/w500/poster.jpg", imdbId: null }],
      references: [], actions: []
    };
    expect(parseServerFrame(JSON.stringify(frame))).toMatchObject({ type: "agent-message" });
    expect(() => parseServerFrame(JSON.stringify({ ...frame, movies: [{ ...frame.movies[0], poster: "https://evil.invalid/a.jpg" }] }))).toThrow();
    expect(sessionCredentialsSchema.safeParse({ version: 1, sessionId: requestId, token: "a".repeat(43), expiresInSeconds: 1800, websocketPath: "/chat" }).success).toBe(true);
  });
});
