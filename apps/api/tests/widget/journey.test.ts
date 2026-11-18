// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqModel, MovieAgent, type ToolGateway } from "@agichat/agent";
import { journeyAgent } from "./fixtures.js";
import { cleanupWidgets, mountClient, send, text, widgetServer } from "./harness.js";

afterEach(cleanupWidgets);

describe("Public widget connected to HTTP/WebSocket API", () => {
  it("opens IMDb and the current book across recommendations, without another model call or a link click", async () => {
    const first = { id: 150, title: "Costa lejana", year: 2014, poster: null, imdb_id: "tt9950150" };
    const second = { ...first, id: 151, title: "Mar abierto", year: 2020, imdb_id: "tt9950151" };
    const call = vi.fn(async (request) => {
      if (request.name === "recommend_movies") { return { isError: false, data: { candidates: [first, second] } }; }
      const movie = request.arguments.movie_id === first.id ? first : second;
      const book = { id: `Book_${movie.id}`, title: `Libro de ${movie.title}`, authors: ["Autora"] };
      return { isError: false, data: { status: "adaptation_identified", movie, book,
        sources: ["https://www.wikidata.org/wiki/Q123"], references: [{ provider: "google-books", id: book.id }] } };
    });
    const complete = vi.fn(async () => { throw new Error("Navigation must not use a model"); });
    const gateway: ToolGateway = { open: vi.fn(async () => ({ call, close: vi.fn(async () => undefined), tools: [
      { name: "recommend_movies", description: "", inputSchema: { type: "object" } },
      { name: "compare_movie_book", description: "", inputSchema: { type: "object", properties: { movie_id: { type: "integer" }, book_id: { type: "string" } }, required: ["movie_id"] } }
    ] })) };
    const api = await widgetServer(new MovieAgent({ complete }, gateway));
    const { host } = await mountClient(api.base);
    const popups = Array.from({ length: 5 }, () => ({ opener: {}, closed: false, close: vi.fn(), location: { replace: vi.fn() } }));
    const open = vi.spyOn(window, "open");
    for (const popup of popups) { open.mockReturnValueOnce(popup as unknown as Window); }
    await send(host, "Recomiéndame una película de acción");
    await text(host, "Te recomiendo Costa lejana");
    await send(host, "¿Está basada en un libro?");
    await text(host, "La evidencia consultada identifica esta adaptación");
    await send(host, "Abre IMDb de eso");
    await vi.waitFor(() => expect(popups[0]!.location.replace).toHaveBeenCalledWith("https://www.imdb.com/title/tt9950150/"));
    await send(host, "Abre Google Books del libro que mencionaste");
    await vi.waitFor(() => expect(popups[1]!.location.replace).toHaveBeenCalledWith("https://books.google.com/books?id=Book_150"));
    await send(host, "Dame otra");
    await text(host, "Te recomiendo Mar abierto");
    await send(host, "¿Está basada en un libro?");
    await vi.waitFor(() => expect(call).toHaveBeenCalledWith({ name: "compare_movie_book", arguments: { movie_id: 151 } }, expect.any(AbortSignal)));
    await send(host, "Abre Google Books de ese libro");
    await vi.waitFor(() => expect(popups[2]!.location.replace).toHaveBeenCalledWith("https://books.google.com/books?id=Book_151"));
    await send(host, "Abre IMDb");
    await vi.waitFor(() => expect(popups[3]!.location.replace).toHaveBeenCalledWith("https://www.imdb.com/title/tt9950151/"));
    await send(host, "Abre Google Books");
    await vi.waitFor(() => expect(popups[4]!.location.replace).toHaveBeenCalledWith("https://books.google.com/books?id=Book_151"));
    expect(open).toHaveBeenCalledTimes(5);
    expect(complete).not.toHaveBeenCalled();
    expect(popups.every((popup) => popup.opener === null && popup.close.mock.calls.length === 0)).toBe(true);
  });
  it("runs the actual Groq adapter and agent through comparison and navigation with mocked external services", async () => {
    const movie = { id: 438631, title: "Dune", year: 2021, poster: "https://image.tmdb.org/t/p/w500/dune.jpg", imdb_id: "tt1160419" };
    const book = { id: "Dune_Book", title: "Dune", authors: ["Frank Herbert", "Editor"] };
    const bookReference = { provider: "google-books", id: book.id };
    const call = vi.fn().mockResolvedValueOnce({ isError: false, data: { candidates: [movie] } })
      .mockResolvedValueOnce({ isError: false, data: { results: [book], references: [bookReference] } })
      .mockResolvedValueOnce({ isError: false, data: { movie, book, references: [bookReference], status: "adaptation_identified",
        sources: ["https://example.org/test-evidence"], differences: [{ text: "La película cubre parte de la novela.", sources: ["https://example.org/test-evidence"] }],
        limitations: ["No se ha verificado fidelidad escena por escena."] } });
    const gateway: ToolGateway = { open: vi.fn(async () => ({ call, close: vi.fn(async () => undefined),
      tools: ["recommend_movies", "search_books", "compare_movie_book"].map((name) => ({ name, description: "", inputSchema: { type: "object" } })) })) };
    const toolReply = (name: string, args: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [
      { id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }
    ] } }] }));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(toolReply("recommend_movies", {}));
    const agent = new MovieAgent(new GroqModel({ apiKey: "synthetic", model: "test", fetch: fetchImpl }), gateway);
    const api = await widgetServer(agent);
    const { host } = await mountClient(api.base);
    const popups = Array.from({ length: 2 }, () => ({ opener: {}, closed: false, close: vi.fn(), location: { replace: vi.fn() } }));
    const open = vi.spyOn(window, "open").mockReturnValueOnce(popups[0] as unknown as Window).mockReturnValueOnce(popups[1] as unknown as Window);
    await send(host, "Recomienda una película");
    await text(host, "Te recomiendo Dune");
    expect(host.querySelector("img[alt='Póster de Dune']")?.getAttribute("src")).toBe(movie.poster);
    await send(host, "Compárala con el libro");
    await text(host, "La película cubre parte de la novela");
    expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ name: "compare_movie_book", arguments: { movie_id: movie.id, book_id: book.id } }), expect.anything());
    await send(host, "Abre IMDb de Dune (2021)");
    await vi.waitFor(() => expect(popups[0]!.location.replace).toHaveBeenCalledWith("https://www.imdb.com/title/tt1160419/"));
    await send(host, "1. Abre Google Books del libro de Dune");
    await vi.waitFor(() => expect(popups[1]!.location.replace).toHaveBeenCalledWith("https://books.google.com/books?id=Dune_Book"));
    expect(open).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledTimes(3);
    expect(gateway.open).toHaveBeenCalledTimes(2);
  });
  it("keeps the genre, seen movies and selected movie through five messages in one widget session", async () => {
    const first = { id: 150, title: "Costa lejana", year: 2014, poster: "https://image.tmdb.org/t/p/w500/costa.jpg", imdb_id: "tt1230150" };
    const second = { ...first, id: 151, title: "Mar abierto", year: 2020 };
    const latest = { ...first, id: 152, title: "La última marea", year: 2025, overview: "Una tripulación vuelve a casa.", genres: ["Acción"] };
    const book = { id: "Ultima_Marea", title: latest.title, authors: ["Autora"] };
    const reference = { provider: "google-books", id: book.id };
    const call = vi.fn().mockResolvedValueOnce({ isError: false, data: { candidates: [first, second] } })
      .mockResolvedValueOnce({ isError: false, data: { candidates: [second, latest] } })
      .mockResolvedValueOnce({ isError: false, data: { results: [book] } })
      .mockResolvedValueOnce({ isError: false, data: { movie: latest, book, references: [reference], status: "adaptation_identified",
        sources: ["https://example.org/evidence"], differences: [{ text: "La película resume el final del libro.", sources: ["https://example.org/evidence"] }] } });
    const gateway: ToolGateway = { open: vi.fn(async () => ({ call, close: vi.fn(async () => undefined),
      tools: ["recommend_movies", "search_books", "compare_movie_book"].map((name) => ({ name, description: "", inputSchema: { type: "object" } })) })) };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("provider details", { status: 429, headers: { "retry-after": "60" } }));
    const onTurn = vi.fn();
    const agent = new MovieAgent(new GroqModel({ apiKey: "synthetic", model: "test", fetch: fetchImpl }), gateway, undefined, onTurn);
    const api = await widgetServer(agent);
    const { host } = await mountClient(api.base);
    for (const [message, answer] of [
      ["Recomiéndame una película de acción, por favor", "Te recomiendo Costa lejana"],
      ["Dame otra", "Te recomiendo Mar abierto"],
      ["Una más reciente", "Te recomiendo La última marea"],
      ["¿Por qué esa?", "Una tripulación vuelve a casa."],
      ["Compárala con el libro", "La película resume el final del libro."]
    ] as const) {
      await send(host, message);
      await text(host, answer);
    }
    expect(host.querySelector("img[alt='Póster de La última marea']")?.getAttribute("src")).toBe(latest.poster);
    const genre = { genres: [28], genre_match: "any" };
    expect(call.mock.calls.map(([request]) => request)).toEqual([
      { name: "recommend_movies", arguments: genre },
      { name: "recommend_movies", arguments: { ...genre, year_from: 2021, sort_by: "primary_release_date.desc" } },
      { name: "search_books", arguments: { query: latest.title } },
      { name: "compare_movie_book", arguments: { movie_id: latest.id, book_id: book.id } }
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(onTurn.mock.calls[0]?.[0]).toEqual({ durationMs: expect.any(Number), tools: ["recommend_movies"], inferences: 1, errorCode: "rate_limited" });
    expect(onTurn.mock.calls[3]?.[0]).toEqual({ durationMs: expect.any(Number), tools: [], inferences: 0, errorCode: null });
    expect(api.createSession).toHaveBeenCalledOnce();
  });
  it.each([
    ["Abre IMDb", "Abre Google Books"],
    ["¿Puedes abrir IMDb?", "¿Podrías abrir Google Books?"]
  ])("recommends, compares and opens references for %s", async (imdbRequest, booksRequest) => {
    const agent = journeyAgent();
    const api = await widgetServer(agent);
    const { host } = await mountClient(api.base);
    const popups = Array.from({ length: 2 }, () => ({ opener: {}, closed: false, close: vi.fn(), location: { replace: vi.fn() } }));
    const open = vi.spyOn(window, "open")
      .mockReturnValueOnce(popups[0] as unknown as Window)
      .mockReturnValueOnce(popups[1] as unknown as Window);
    expect(host.textContent).toContain("Modo de prueba");
    expect(host.querySelector("[aria-label='Créditos de TMDB']")).not.toBeNull();
    await send(host, "Recomienda una película");
    await text(host, "Adaptación de prueba");
    expect(host.querySelector("img[alt='Póster de Adaptación de prueba']")?.getAttribute("src")).toBe("https://image.tmdb.org/t/p/w500/test.jpg");
    expect(open).not.toHaveBeenCalled();
    await send(host, "Compárala con el libro");
    await text(host, "Comparación de prueba");
    expect(agent.respond).toHaveBeenLastCalledWith(expect.objectContaining({ history: [expect.objectContaining({ user: "Recomienda una película" })] }));
    await send(host, imdbRequest);
    await vi.waitFor(() => expect(popups[0]!.location.replace).toHaveBeenCalledWith("https://www.imdb.com/title/tt1234567/"));
    await send(host, booksRequest);
    await vi.waitFor(() => expect(popups[1]!.location.replace).toHaveBeenCalledWith("https://books.google.com/books?id=volume_1"));
    expect(open).toHaveBeenCalledTimes(2);
    expect(popups.every((popup) => popup.opener === null)).toBe(true);
    expect(popups.every((popup) => popup.close.mock.calls.length === 0)).toBe(true);
    expect(api.createSession).toHaveBeenCalledOnce();
  });

  it("does not share conversation state between two widget clients", async () => {
    const agent = journeyAgent();
    const api = await widgetServer(agent);
    const a = await mountClient(api.base);
    const b = await mountClient(api.base);
    await send(a.host, "Recomienda una película");
    await text(a.host, "Adaptación de prueba");
    expect(b.host.textContent).not.toContain("Adaptación de prueba");
    await send(b.host, "Otra conversación");
    await text(b.host, "Adaptación de prueba");
    expect(agent.respond).toHaveBeenLastCalledWith(expect.objectContaining({ content: "Otra conversación", history: [] }));
    expect(api.createSession).toHaveBeenCalledTimes(2);
    a.unmount(); a.transport.dispose();
    await send(b.host, "Compárala con el libro");
    await text(b.host, "Comparación de prueba");
    expect(a.host.childElementCount).toBe(0);
  });
});
