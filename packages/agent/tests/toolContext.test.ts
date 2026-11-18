import { describe, expect, it, vi } from "vitest";
import { MovieAgent } from "../src/index.js";
import { isCompletedComparison, toolContext } from "../src/toolContext.js";
import { fixtures, movie, signal } from "./helpers.js";

describe("bounded tool context", () => {
  it("removes presentation data while preserving evidence, uncertainty and untrusted metadata", () => {
    const input = { movie: { ...movie, url: "https://example.org", identifiers: [] }, sources: ["https://example.org/source"],
      limitations: ["Sin prueba de fidelidad"], provenance: { trust: "untrusted_external" }, content_notice: "duplicate", value: null };
    const output = toolContext(input);
    expect(output).toEqual({ movie: { id: movie.id, title: movie.title, year: movie.year, imdb_id: movie.imdb_id, overview: movie.overview },
      sources: input.sources, limitations: input.limitations, provenance: input.provenance, value: null });
    expect(input.movie.poster).toBe(movie.poster);
  });
  it.each([null, "text", {}, { status: "possible_match" }, { status: "insufficient_evidence" }])("keeps tools available for incomplete comparisons: %j", (data) => {
    expect(isCompletedComparison("compare_movie_book", data)).toBe(false);
  });
  it("does not treat a status in another tool as a completed comparison", () => {
    expect(isCompletedComparison("search_books", { status: "adaptation_identified" })).toBe(false);
  });
  it.each([false, true])("only finalizes successful verified comparisons (error=%s)", async (isError) => {
    const f = fixtures([{ content: "", toolCalls: [{ name: "compare_movie_book", arguments: { movie_id: 501, book_id: "book" } }] },
      { content: "Puedes considerar la adaptación, con las limitaciones indicadas.", toolCalls: [] }]);
    const tools = [{ name: "compare_movie_book", description: "Compara", inputSchema: { type: "object" } }];
    const session = { ...f.session, tools };
    vi.mocked(f.gateway.open).mockResolvedValue(session);
    vi.mocked(session.call).mockResolvedValue({ isError, data: { status: "adaptation_identified", movie,
      references: [{ provider: "google-books", id: "book" }] } });
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content: "Compara", history: [], signal: signal() });
    expect(vi.mocked(f.model.complete).mock.calls[1]?.[1]).toEqual(isError ? tools : []);
    expect(reply.movies).toHaveLength(isError ? 0 : 1);
    if (!isError) { expect(reply.movies[0]?.poster).toBe(movie.poster); }
    expect(session.close).toHaveBeenCalledOnce();
  });
  it("rejects further tool calls when only final text was requested", async () => {
    const call = { content: "", toolCalls: [{ name: "compare_movie_book", arguments: {} }] };
    const f = fixtures([call]);
    vi.mocked(f.gateway.open).mockResolvedValue({ ...f.session, tools: [{ name: "compare_movie_book", description: "", inputSchema: {} }] });
    vi.mocked(f.session.call).mockResolvedValue({ isError: false, data: { status: "adaptation_identified" } });
    await expect(new MovieAgent(f.model, f.gateway).respond({ content: "Compara", history: [], signal: signal() })).rejects.toMatchObject({ code: "policy_denied" });
    expect(f.session.call).toHaveBeenCalledOnce();
    expect(f.session.close).toHaveBeenCalledOnce();
  });
});
