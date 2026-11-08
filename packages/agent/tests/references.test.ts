import { describe, expect, it } from "vitest";

import { resolveReferenceRequest } from "../src/index.js";

const imdb = { provider: "imdb" as const, id: "tt1234567" };
const other = { provider: "imdb" as const, id: "tt7654321" };
const book = { provider: "google-books" as const, id: "book_1" };
describe("reference intent and ambiguity", () => {
  it.each(["Abre IMDb", "¿Puedes abrir IMDb?", "Open IMDb"])("recognizes %s", (content) => {
    expect(resolveReferenceRequest(content, [imdb, imdb])).toEqual({ requested: true, reference: imdb });
  });
  it.each(["No abrir IMDb", "Nunca abre IMDb", "Don't open IMDb", "Me interesa IMDb", "Abre otro sitio"])("does not navigate on %s", (content) => {
    expect(resolveReferenceRequest(content, [imdb]).requested).toBe(false);
  });
  it("requires clarification for multiple or unknown references", () => {
    expect(resolveReferenceRequest("Abre IMDb", [imdb, other]).reference).toBeNull();
    expect(resolveReferenceRequest("Abre IMDb", []).reference).toBeNull();
    expect(resolveReferenceRequest("Abre IMDb y Google Books", [imdb, book]).reference).toBeNull();
    expect(resolveReferenceRequest("Abre IMDb tt7654321", [imdb, other]).reference).toEqual(other);
  });
  it("supports Google Books and validates explicit selections", () => {
    expect(resolveReferenceRequest("Abre Google Books", [book]).reference).toEqual(book);
    expect(resolveReferenceRequest("Abre", [imdb], imdb).reference).toEqual(imdb);
    expect(resolveReferenceRequest("Abre", [imdb], other).reference).toBeNull();
  });
});
