import { describe, expect, it, vi } from "vitest";

import { AgentError, FixtureModel, MovieAgent, OllamaModel } from "../src/index.js";
import { collectEvidence, safeOutput, SYSTEM_PROMPT } from "../src/policy.js";
import { fixtures, movie, recommendCall, signal } from "./helpers.js";

describe("MovieAgent", () => {
  it("uses tools, isolates external data and returns validated movie cards", async () => {
    const f = fixtures([recommendCall, { content: "Marea alta puede interesarte.", toolCalls: [] }]);
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content: "Busca Marea alta", history: [], signal: signal() });
    expect(reply.movies).toEqual([{ id: 501, title: "Marea alta", year: 2018, poster: movie.poster, imdbId: "tt9950101" }]);
    expect(reply.references).toEqual([{ provider: "imdb", id: "tt9950101", label: "Marea alta (2018)" }]);
    expect(reply.actions).toEqual([]);
    expect(f.model.complete).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ role: "tool", content: expect.stringContaining('"trust":"untrusted_external"') })]), f.session.tools, expect.any(AbortSignal));
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it("asks for preferences when the welcome prompt requests a question first", async () => {
    const f = fixtures();
    const reply = await new MovieAgent(f.model, f.gateway).respond({
      content: "Recomiéndame una película. Me gustaría que primero me preguntaras por mis gustos.", history: [], signal: signal()
    });
    expect(reply.content).toContain("¿Qué géneros te gustan");
    expect(f.gateway.open).not.toHaveBeenCalled();
  });
  it("queries the requested genre without waiting for the model", async () => {
    const f = fixtures([
      { content: "Prueba una película inventada.", toolCalls: [] },
      { content: "Marea alta puede interesarte.", toolCalls: [] }
    ]);
    vi.mocked(f.session.call).mockResolvedValue({ isError: false, data: { candidates: [{ ...movie, genres: ["Ciencia ficción"], rating: 7.8, vote_count: 1200 }] } });
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content: "Recomiéndame ciencia ficción", history: [], signal: signal() });
    expect(f.session.call).toHaveBeenCalledWith(expect.objectContaining({ name: "recommend_movies", arguments: { genres: [878], genre_match: "any" } }), expect.any(AbortSignal));
    expect(reply.content).toContain("Te recomiendo Marea alta (2018)");
    expect(reply.content).toContain("Ciencia ficción");
    expect(reply.content).toContain("7.8/10");
    expect(reply.content).not.toContain("inventada");
    expect(reply.movies).toHaveLength(1);
    expect(f.model.complete).not.toHaveBeenCalled();
  });
  it("keeps the recommendation intent when the user answers the welcome question", async () => {
    const f = fixtures([{ content: "Podría interesarte algo.", toolCalls: [] }]);
    const reply = await new MovieAgent(f.model, f.gateway).respond({
      content: "Me gusta la ciencia ficción", history: [{
        user: "Recomiéndame una película. Me gustaría que primero me preguntaras por mis gustos.",
        assistant: "¿Qué géneros te gustan y qué ánimo buscas hoy? También puedes decirme una película que hayas disfrutado.",
        references: []
      }], signal: signal()
    });
    expect(f.session.call).toHaveBeenCalledWith(expect.objectContaining({ arguments: { genres: [878], genre_match: "any" } }), expect.any(AbortSignal));
    expect(reply.content).toContain("Te recomiendo Marea alta");
  });
  it("uses MCP to answer a recommendation and book check when Groq is rate limited", async () => {
    const f = fixtures();
    vi.mocked(f.model.complete).mockRejectedValue(new AgentError("rate_limited"));
    vi.mocked(f.gateway.open).mockResolvedValue({ ...f.session, tools: [
      ...f.session.tools,
      { name: "search_books", description: "", inputSchema: { type: "object" } },
      { name: "compare_movie_book", description: "", inputSchema: { type: "object" } }
    ] });
    vi.mocked(f.session.call).mockImplementation(async (call) => {
      if (call.name === "recommend_movies") { return { isError: false, data: { candidates: [{ ...movie, original_title: "Marea alta", genres: ["Acción"] }] } }; }
      if (call.name === "search_books") { return { isError: false, data: { results: [{ id: "Book_501", title: "Marea alta", authors: ["Autora"] }] } }; }
      return { isError: false, data: { status: "adaptation_identified", movie, sources: ["https://example.org/evidence"],
        book: { id: "Book_501", title: "Marea alta", authors: ["Autora"] }, references: [{ provider: "google-books", id: "Book_501" }] } };
    });
    const reply = await new MovieAgent(f.model, f.gateway).respond({
      content: "Ahora recomiéndame una película de acción y dime si es adaptación de un libro", history: [], signal: signal()
    });
    expect(f.session.call).toHaveBeenNthCalledWith(1, { name: "recommend_movies", arguments: { genres: [28], genre_match: "any" } }, expect.any(AbortSignal));
    expect(f.session.call).toHaveBeenNthCalledWith(2, { name: "search_books", arguments: { query: "Marea alta" } }, expect.any(AbortSignal));
    expect(f.session.call).toHaveBeenNthCalledWith(3, { name: "compare_movie_book", arguments: { movie_id: 501, book_id: "Book_501" } }, expect.any(AbortSignal));
    expect(reply.content).toContain("Te recomiendo Marea alta");
    expect(reply.content).toContain("La evidencia consultada identifica esta adaptación");
    expect(reply.movies).toHaveLength(1);
    expect(reply.references).toContainEqual({ provider: "google-books", id: "Book_501", label: "Marea alta", aliases: ["Marea alta"] });
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it("does not claim an adaptation from an unrelated book during rate-limit recovery", async () => {
    const f = fixtures();
    vi.mocked(f.model.complete).mockRejectedValue(new AgentError("rate_limited"));
    vi.mocked(f.gateway.open).mockResolvedValue({ ...f.session, tools: [...f.session.tools, { name: "search_books", description: "", inputSchema: { type: "object" } }] });
    vi.mocked(f.session.call).mockResolvedValueOnce({ isError: false, data: { candidates: [movie] } })
      .mockResolvedValueOnce({ isError: false, data: { results: [{ id: "other", title: "Otro libro", authors: ["Autora"] }] } });
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content: "Recomiéndame una película de acción y dime si adapta un libro", history: [], signal: signal() });
    expect(reply.content).toContain("No pude comprobar con evidencia");
    expect(reply.content).not.toContain("identifica esta adaptación");
    expect(f.session.call).toHaveBeenCalledTimes(2);
  });
  it("reuses the recommendation with its original filters after a provider failure", async () => {
    const f = fixtures();
    const specific = { ...recommendCall.toolCalls[0]!, arguments: { genres: [28], min_rating: 7 } };
    vi.mocked(f.model.complete).mockResolvedValueOnce({ content: "", toolCalls: [specific] })
      .mockRejectedValueOnce(new AgentError("unavailable"));
    const reply = await new MovieAgent(f.model, f.gateway).respond({
      content: "Recomienda una película de acción y dime si adapta un libro", history: [], signal: signal()
    });
    expect(reply.movies[0]?.id).toBe(movie.id);
    expect(reply.context?.recommendation?.criteria).toEqual(specific.arguments);
    expect(f.session.call).toHaveBeenCalledExactlyOnceWith(specific, expect.any(AbortSignal));
  });
  it("returns already verified movie evidence if Groq is limited after the MCP call", async () => {
    const f = fixtures();
    vi.mocked(f.model.complete).mockResolvedValueOnce(recommendCall).mockRejectedValueOnce(new AgentError("rate_limited"));
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content: "Busca una película de ciencia ficción", history: [], signal: signal() });
    expect(reply.content).toContain("Marea alta");
    expect(reply.movies[0]?.id).toBe(movie.id);
    expect(f.session.call).toHaveBeenCalledOnce();
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it("passes bounded conversation context and preserves known references", async () => {
    const f = fixtures();
    const history = Array.from({ length: 12 }, (_, i) => ({ user: `user ${i}`, assistant: `reply ${i}`, references: [{ provider: "imdb" as const, id: "tt9950101" }] }));
    const result = await new MovieAgent(f.model, f.gateway).respond({ content: "¿Por qué?", history, signal: signal() });
    expect(f.model.complete).toHaveBeenCalledWith(expect.not.arrayContaining([expect.objectContaining({ content: "user 0" })]), expect.anything(), expect.anything());
    expect(result.references).toHaveLength(1);
  });
  it("opens only an explicitly requested reference observed in the session", async () => {
    const f = fixtures();
    const reference = { provider: "imdb" as const, id: "tt9950101" };
    const agent = new MovieAgent(f.model, f.gateway);
    expect((await agent.respond({ content: "Abre IMDb", history: [{ user: "Hola", assistant: "Película", references: [reference] }], openReference: reference, signal: signal() })).actions).toEqual([{ type: "open-reference", reference }]);
    expect(f.gateway.open).not.toHaveBeenCalled();
    await expect(agent.respond({ content: "Abre", history: [], openReference: reference, signal: signal() })).rejects.toMatchObject({ code: "policy_denied" });
  });
  it.each([
    [{ content: "", toolCalls: [{ name: "run_shell", arguments: {} }] }, "policy_denied"],
    [{ content: "", toolCalls: Array.from({ length: 4 }, () => ({ name: "recommend_movies", arguments: {} })) }, "limit_exceeded"],
    [{ content: SYSTEM_PROMPT, toolCalls: [] }, "policy_denied"]
  ] as const)("blocks invalid model behavior and closes MCP", async (reply, code) => {
    const f = fixtures([reply]);
    await expect(new MovieAgent(f.model, f.gateway).respond({ content: "Consulta", history: [], signal: signal() })).rejects.toMatchObject({ code });
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it("bounds repeated tool calls", async () => {
    const f = fixtures([recommendCall]);
    expect((await new MovieAgent(f.model, f.gateway).respond({ content: "Consulta", history: [], signal: signal() })).movies[0]?.id).toBe(movie.id);
    expect(f.session.call).toHaveBeenCalledOnce();
    expect(f.model.complete).toHaveBeenCalledTimes(2);
  });
  it("does not turn tool errors into evidence", async () => {
    const f = fixtures([recommendCall, { content: "La consulta no está disponible.", toolCalls: [] }]);
    vi.mocked(f.session.call).mockResolvedValue({ isError: true, data: { movie } });
    await expect(new MovieAgent(f.model, f.gateway).respond({ content: "Consulta", history: [], signal: signal() })).rejects.toMatchObject({ code: "unavailable" });
  });
  it("bounds catalog pages before offering candidates to the model", async () => {
    const f = fixtures([recommendCall, { content: "Estos candidatos pueden interesarte.", toolCalls: [] }]);
    vi.mocked(f.session.call).mockResolvedValue({ isError: false, data: { candidates: Array.from({ length: 20 }, (_, index) => ({ ...movie, id: index + 1 })), total_results: 20 } });
    const result = await new MovieAgent(f.model, f.gateway).respond({ content: "Drama", history: [], signal: signal() });
    expect(result.movies).toHaveLength(5);
    const last = vi.mocked(f.model.complete).mock.calls.at(-1)?.[0].at(-1);
    expect(JSON.parse(last?.content as string).data.candidates).toHaveLength(5);
  });
  it("closes tools after provider failure, oversized results or cancellation", async () => {
    for (const scenario of ["provider", "size", "cancel"]) {
      const f = fixtures([recommendCall]);
      const controller = new AbortController();
      if (scenario === "provider") { vi.mocked(f.model.complete).mockRejectedValue(new Error("internal provider credentials")); }
      if (scenario === "size") { vi.mocked(f.session.call).mockResolvedValue({ isError: false, data: "x".repeat(33000) }); }
      if (scenario === "cancel") { vi.mocked(f.model.complete).mockImplementation(async () => { controller.abort(); return recommendCall; }); }
      await expect(new MovieAgent(f.model, f.gateway).respond({ content: "Consulta", history: [], signal: controller.signal })).rejects.toBeDefined();
      expect(f.session.close).toHaveBeenCalledOnce();
    }
  });
  it("does not open MCP for an already cancelled turn", async () => {
    const f = fixtures();
    const controller = new AbortController(); controller.abort();
    await expect(new MovieAgent(f.model, f.gateway).respond({ content: "Hola", history: [], signal: controller.signal })).rejects.toBeDefined();
    expect(f.gateway.open).not.toHaveBeenCalled();
  });
  it.each(["Abre IMDb", "¿Puedes abrir IMDb?"])("opens a known reference for %s and clarifies unknown targets", async (content) => {
    const f = fixtures();
    const agent = new MovieAgent(f.model, f.gateway);
    const reference = { provider: "imdb" as const, id: "tt9950101" };
    const result = await agent.respond({ content, history: [{ user: "Una película", assistant: "Marea alta", references: [reference] }], signal: signal() });
    expect(result.actions).toEqual([{ type: "open-reference", reference }]);
    const unclear = await agent.respond({ content: "Abre Google Books", history: [], signal: signal() });
    expect(unclear.actions).toEqual([]);
    expect(unclear.content).toContain("Primero busca y compara un libro concreto");
  });
  it("lists safe choices when several IMDb references were returned", async () => {
    const f = fixtures();
    const first = { provider: "imdb" as const, id: "tt1160419" };
    const second = { provider: "imdb" as const, id: "tt0087182" };
    const context = { movies: [
      { id: 438631, title: "Dune", year: 2021, poster: null, imdbId: first.id },
      { id: 841, title: "Dune", year: 1984, poster: null, imdbId: second.id }
    ], books: [] };
    const reply = await new MovieAgent(f.model, f.gateway).respond({
      content: "¿Puedes abrir IMDb?", history: [{ user: "Busca Dune", assistant: "Dos películas", references: [first, second], context }], signal: signal()
    });
    expect(reply.actions).toEqual([]);
    expect(reply.content).toContain("Dune (2021)");
    expect(reply.content).toContain("Dune (1984)");
    expect(reply.content).toContain("Abre IMDb de Dune (2021)");
    expect(reply.content).not.toContain("tt1160419");
    const chosen = await new MovieAgent(f.model, f.gateway).respond({
      content: "Abre IMDb de Dune (2021)", history: [{ user: "Busca Dune", assistant: "Dos películas", references: [first, second], context }], signal: signal()
    });
    expect(chosen.actions).toEqual([{ type: "open-reference", reference: { ...first, label: "Dune (2021)" } }]);
    expect(f.gateway.open).not.toHaveBeenCalled();
  });
  it("shows only the verified movie card after a comparison", async () => {
    const other = { ...movie, id: 502, title: "Otra película", imdb_id: "tt9950102" };
    const f = fixtures([
      recommendCall,
      { content: "", toolCalls: [{ name: "compare_movie_book", arguments: { movie_id: movie.id, book_id: "book_1" } }] },
      { content: "Comparación completa.", toolCalls: [] }
    ]);
    vi.mocked(f.gateway.open).mockResolvedValue({
      ...f.session, tools: [...f.session.tools, { name: "compare_movie_book", description: "Compara", inputSchema: { type: "object" } }]
    });
    vi.mocked(f.session.call).mockImplementation(async (call) => call.name === "recommend_movies"
      ? { isError: false, data: { candidates: [movie, other] } }
      : { isError: false, data: { status: "adaptation_identified", sources: ["https://example.org/source"], movie, book: { id: "book_1", title: "Libro", authors: ["Autora"] }, references: [{ provider: "google-books", id: "book_1" }] } });
    const result = await new MovieAgent(f.model, f.gateway).respond({ content: "Compara esta película con el libro", history: [], signal: signal() });
    expect(result.movies.map((entry) => entry.id)).toEqual([movie.id]);
    expect(result.references).toEqual(expect.arrayContaining([{ provider: "google-books", id: "book_1", label: "Libro", aliases: [movie.title] }]));
    const history = [{ user: "Compara esta película con el libro", assistant: result.content, references: result.references, context: result.context! }];
    const opened = await new MovieAgent(f.model, f.gateway).respond({ content: `Abre Google Books del libro de ${movie.title}`, history, signal: signal() });
    expect(opened.actions).toEqual([{ type: "open-reference", reference: { provider: "google-books", id: "book_1", label: "Libro", aliases: [movie.title] } }]);
    expect(f.gateway.open).toHaveBeenCalledOnce();
  });
  it("does not offer comparison for a movie-only search", async () => {
    const f = fixtures([recommendCall, { content: "Encontré la película.", toolCalls: [] }]);
    vi.mocked(f.gateway.open).mockResolvedValue({ ...f.session, tools: [...f.session.tools, { name: "compare_movie_book", description: "Compara", inputSchema: { type: "object" } }] });
    const result = await new MovieAgent(f.model, f.gateway).respond({ content: "Busca Los juegos del hambre de 2012", history: [], signal: signal() });
    expect(result.content).toContain("Resultados de TMDB");
    expect(f.model.complete).toHaveBeenCalledWith(expect.anything(), expect.not.arrayContaining([expect.objectContaining({ name: "compare_movie_book" })]), expect.anything());
  });
});

describe("output and evidence policy", () => {
  it.each([null, "text", {}, { results: [null, "text", { ...movie, poster: "https://evil.invalid" }] }])("ignores unstructured or invalid evidence", (data) => {
    expect(collectEvidence(data).movies).toEqual([]);
  });
  it("handles missing optional fields and explicit book references", () => {
    expect(collectEvidence({ movie: { id: 1, title: "Película" }, references: [{ provider: "google-books", id: "volume_1", label: "Texto externo" }, { provider: "evil", id: "x" }] })).toEqual({ movies: [{ id: 1, title: "Película", year: null, poster: null, imdbId: null }], references: [{ provider: "google-books", id: "volume_1" }] });
  });
  it.each(["", "x".repeat(6001), "<script>alert(1)</script>", "https://evil.invalid", "AGICHAT_POLICY_V1_INTERNAL", "javascript:alert(1)", "[Abre](//evil.invalid)", "![Imagen](/tracking)", "[Fuente][ref]\n[ref]: //evil.invalid"])("rejects unsafe visible output", (text) => expect(safeOutput(text)).toBe(false));
});

describe("Ollama adapter", () => {
  it("sends native tools/history with streaming off and parses tool calls", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: { content: "", tool_calls: [{ function: { name: "recommend_movies", arguments: {} } }] } })));
    const model = new OllamaModel({ url: "http://localhost:11434", model: "qwen3:4b", fetch: fetchImpl });
    const reply = await model.complete([{ role: "assistant", content: "", toolCalls: recommendCall.toolCalls }, { role: "tool", toolName: "recommend_movies", content: "{}" }], [{ name: "recommend_movies", description: "Busca", inputSchema: { type: "object" } }], signal());
    expect(reply).toEqual(recommendCall);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(init?.body as string)).toMatchObject({ model: "qwen3:4b", stream: false, think: false, messages: [expect.objectContaining({ tool_calls: expect.any(Array) }), expect.objectContaining({ tool_name: "recommend_movies" })], tools: [expect.objectContaining({ type: "function" })] });
  });
  it.each([new Response("no", { status: 503 }), new Response('{"message":{}}')])("redacts unavailable and malformed provider responses", async (response) => {
    const model = new OllamaModel({ url: "http://localhost:11434", model: "test", fetch: vi.fn().mockResolvedValue(response) });
    await expect(model.complete([], [], signal())).rejects.toBeInstanceOf(AgentError);
  });
  it("accepts a final text response without tool calls", async () => {
    const model = new OllamaModel({ url: "http://localhost:11434", model: "test", fetch: vi.fn().mockResolvedValue(new Response('{"message":{"content":"Hola"}}')) });
    expect(await model.complete([{ role: "user", content: "Hola" }], [], signal())).toEqual({ content: "Hola", toolCalls: [] });
  });
});

describe("fixture integration mode", () => {
  it("requests movie tools then identifies itself in the final reply", async () => {
    const model = new FixtureModel();
    const f = fixtures();
    expect((await model.complete([], f.session.tools, signal())).toolCalls).toHaveLength(1);
    expect((await model.complete([{ role: "tool", content: "{}" }], f.session.tools, signal())).content).toContain("sin LLM");
    expect((await model.complete([], [], signal())).toolCalls).toEqual([]);
  });
});
