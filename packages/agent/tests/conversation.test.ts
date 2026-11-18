import { describe, expect, it, vi } from "vitest";
import { AgentError, MovieAgent, type ConversationTurn, type EvidenceContext } from "../src/index.js";
import { comparisonRequested, fallbackRecommendationCriteria, selectedMovieComparison } from "../src/grounding.js";
import { fixtures, movie, signal } from "./helpers.js";

const automaticComparison = { name: "compare_movie_book", description: "", inputSchema: {
  type: "object", properties: { movie_id: { type: "integer" }, book_id: { type: "string" } }, required: ["movie_id"]
} };
const card = { id: movie.id, title: movie.title, year: movie.year, poster: movie.poster, imdbId: movie.imdb_id };
const turn = (context: EvidenceContext): ConversationTurn => ({ user: "Consulta anterior", assistant: "Respuesta anterior", references: [], context });
const comparison = (entry = movie, verified = true) => ({ status: verified ? "adaptation_identified" : "insufficient_evidence",
  movie: entry, book: verified ? { id: `Book_${entry.id}`, title: entry.title, authors: ["Autora"] } : null,
  reasons: [verified ? "Se identificó la obra de origen." : "No se identificó una obra de origen en las fuentes consultadas."],
  sources: ["https://www.wikidata.org/wiki/Q123"], references: verified ? [{ provider: "google-books", id: `Book_${entry.id}` }] : [],
  differences: [], similarities: [], recommendation: { verdict: "consider", reasons: ["Puedes considerar verla."] }, limitations: [] });

describe("general conversations without unnecessary inference", () => {
  it("retains explicit filters when Groq is rate limited instead of silently widening the recommendation", async () => {
    const f = fixtures();
    vi.mocked(f.model.complete).mockRejectedValue(new AgentError("rate_limited"));
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content: "Recomiéndame un thriller de los años noventa con valoración mínima de 7 y al menos 100 votos.", history: [], signal: signal() });
    expect(reply.context?.recommendation?.criteria).toEqual({ genres: [53], genre_match: "any", year_from: 1990, year_to: 1999, min_rating: 7, min_vote_count: 100 });
    expect(f.session.call).toHaveBeenCalledOnce();
  });
  it("extracts bounded years, ranges, decades and decimal ratings for provider recovery", () => {
    expect(fallbackRecommendationCriteria("Drama entre 2001 y 2008 con nota mínima de 7,5 y más de 50 votos")).toMatchObject({ year_from: 2001, year_to: 2008, min_rating: 7.5, min_vote_count: 51 });
    expect(fallbackRecommendationCriteria("Acción de 2019")).toMatchObject({ year: 2019 });
    expect(fallbackRecommendationCriteria("Drama de los años 80")).toMatchObject({ year_from: 1980, year_to: 1989 });
    expect(fallbackRecommendationCriteria("Drama de los años 2000")).toMatchObject({ year_from: 2000, year_to: 2009 });
    expect(fallbackRecommendationCriteria("Terror de los años ochenta")).toMatchObject({ year_from: 1980, year_to: 1989 });
  });
  it.each(["Acción", "Comedia", "Ciencia ficción", "Animación", "Misterio"])("remembers that the user is answering a preferences question: %s", async (genre) => {
    const f = fixtures();
    const agent = new MovieAgent(f.model, f.gateway);
    const question = await agent.respond({ content: "Recomiéndame una película. Primero pregúntame por mis gustos", history: [], signal: signal() });
    expect(question.context?.awaitingPreferences).toBe(true);
    const answer = await agent.respond({ content: genre, history: [turn(question.context!)], signal: signal() });
    expect(answer.movies).toHaveLength(1);
    expect(answer.context?.awaitingPreferences).not.toBe(true);
    expect(f.model.complete).not.toHaveBeenCalled();
    expect(f.session.call).toHaveBeenCalledWith({ name: "recommend_movies", arguments: expect.objectContaining({ genres: expect.any(Array) }) }, expect.any(AbortSignal));
  });
  it.each(["¿Está inspirada en algún libro?", "¿Está basada en un libro?", "Compárala", "¿Tiene libro?"])("uses the actual selected movie for a book follow-up: %s", async (content) => {
    const f = fixtures();
    vi.mocked(f.gateway.open).mockResolvedValue({ ...f.session, tools: [...f.session.tools, automaticComparison] });
    vi.mocked(f.session.call).mockResolvedValue({ isError: false, data: comparison() });
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content, history: [turn({ movies: [card], books: [] })], signal: signal() });
    expect(reply.content).toContain("identifica esta adaptación");
    expect(f.session.call).toHaveBeenCalledExactlyOnceWith({ name: "compare_movie_book", arguments: { movie_id: movie.id } }, expect.any(AbortSignal));
    expect(f.model.complete).not.toHaveBeenCalled();
    expect(reply.references).toContainEqual(expect.objectContaining({ provider: "google-books", id: `Book_${movie.id}` }));
  });
  it("finds a book adaptation among several candidates rather than asserting a first guess", async () => {
    const f = fixtures();
    const other = { ...movie, id: 502, title: "Camino abierto", imdb_id: "tt9950102" };
    vi.mocked(f.gateway.open).mockResolvedValue({ ...f.session, tools: [...f.session.tools, automaticComparison] });
    vi.mocked(f.session.call).mockImplementation(async (call) => ({ isError: false, data: call.name === "recommend_movies"
      ? { candidates: [movie, other] } : comparison(call.arguments.movie_id === movie.id ? movie : other, call.arguments.movie_id === other.id) }));
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content: "Recomiéndame una película basada en un libro que valga la pena leer", history: [], signal: signal() });
    expect(reply.movies.map((entry) => entry.id)).toEqual([other.id]);
    expect(reply.content).toContain("Te recomiendo Camino abierto");
    expect(reply.context?.comparisonStatus).toBe("adaptation_identified");
    expect(f.session.call).toHaveBeenCalledTimes(3);
    expect(f.session.call).toHaveBeenNthCalledWith(1, { name: "recommend_movies", arguments: { based_on_book: true } }, expect.any(AbortSignal));
    expect(f.model.complete).not.toHaveBeenCalled();
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it("bounds inconclusive searches, distinguishes no evidence from no adaptation, and retains the poster", async () => {
    const f = fixtures();
    const candidates = Array.from({ length: 10 }, (_, index) => ({ ...movie, id: index + 1 }));
    vi.mocked(f.gateway.open).mockResolvedValue({ ...f.session, tools: [...f.session.tools, automaticComparison] });
    vi.mocked(f.session.call).mockImplementation(async (call) => ({ isError: false, data: call.name === "recommend_movies"
      ? { candidates } : comparison(candidates.find((entry) => entry.id === call.arguments.movie_id)!, false) }));
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content: "Recomienda una adaptación de un libro", history: [], signal: signal() });
    expect(reply.content).toContain("no pude completar una comparación verificada");
    expect(reply.content).not.toContain("Te recomiendo");
    expect(reply.movies[0]?.poster).toBe(movie.poster);
    expect(f.session.call).toHaveBeenCalledTimes(4);
  });
  it("rejects malformed comparisons and provider errors, preserving cleanup", async () => {
    for (const data of [{ ...comparison(), movie: { ...movie, id: 999 } }, { ...comparison(), status: "invented" }]) {
      const f = fixtures();
      vi.mocked(f.gateway.open).mockResolvedValue({ ...f.session, tools: [automaticComparison] });
      vi.mocked(f.session.call).mockResolvedValue({ isError: false, data });
      await expect(new MovieAgent(f.model, f.gateway).respond({ content: "Compárala", history: [turn({ movies: [card], books: [] })], signal: signal() })).rejects.toMatchObject({ code: "unavailable" });
      expect(f.session.close).toHaveBeenCalledOnce();
    }
    const f = fixtures();
    vi.mocked(f.gateway.open).mockResolvedValue({ ...f.session, tools: [automaticComparison] });
    vi.mocked(f.session.call).mockResolvedValue({ isError: true, data: null, error: new AgentError("rate_limited") });
    await expect(new MovieAgent(f.model, f.gateway).respond({ content: "Compárala", history: [turn({ movies: [card], books: [] })], signal: signal() })).rejects.toMatchObject({ code: "rate_limited" });
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it("preserves an explicitly selected book and refuses adversarial comparison text", async () => {
    const f = fixtures();
    vi.mocked(f.gateway.open).mockResolvedValue({ ...f.session, tools: [automaticComparison] });
    vi.mocked(f.session.call).mockResolvedValue({ isError: false, data: { ...comparison(), reasons: ["https://evil.test"] } });
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content: "Compárala", history: [turn({ movies: [card], books: [{ id: "Book_501", title: "Marea alta", authors: ["Autora"] }] })], signal: signal() });
    expect(f.session.call).toHaveBeenCalledWith({ name: "compare_movie_book", arguments: { movie_id: 501, book_id: "Book_501" } }, expect.any(AbortSignal));
    expect(reply.content).not.toContain("evil");
    expect(comparisonRequested("¿Está inspirada en algún libro?")).toBe(true);
    expect(selectedMovieComparison("¿Está inspirada en algún libro?")).toBe(true);
    expect(selectedMovieComparison("Compárala con el libro de otra autora")).toBe(false);
  });
});
