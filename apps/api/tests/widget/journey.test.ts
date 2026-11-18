// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqModel, MovieAgent, type ToolGateway } from "@agichat/agent";
import { journeyAgent } from "./fixtures.js";
import { cleanupWidgets, mountClient, send, text, widgetServer } from "./harness.js";

afterEach(cleanupWidgets);

describe("Public widget connected to HTTP/WebSocket API", () => {
  it("runs the actual Groq adapter and agent through comparison and navigation with mocked external services", async () => {
    const movie = { id: 438631, title: "Dune", year: 2021, poster: "https://image.tmdb.org/t/p/w500/dune.jpg", imdb_id: "tt1160419" };
    const book = { id: "Dune_Book", title: "Dune", authors: ["Frank Herbert", "Editor"] };
    const bookReference = { provider: "google-books", id: book.id };
    const otherBook = { id: "Other_Dune", title: "Dune", authors: ["Otro autor"] };
    const call = vi.fn().mockResolvedValueOnce({ isError: false, data: { candidates: [movie] } })
      .mockResolvedValueOnce({ isError: false, data: { results: [book, otherBook], references: [bookReference, { provider: "google-books", id: otherBook.id }] } })
      .mockResolvedValueOnce({ isError: false, data: { movie, book, references: [bookReference], status: "adaptation_identified",
        sources: ["https://example.org/test-evidence"], differences: [{ text: "La película cubre parte de la novela.", sources: ["https://example.org/test-evidence"] }],
        limitations: ["No se ha verificado fidelidad escena por escena."] } });
    const gateway: ToolGateway = { open: vi.fn(async () => ({ call, close: vi.fn(async () => undefined),
      tools: ["recommend_movies", "search_books", "compare_movie_book"].map((name) => ({ name, description: "", inputSchema: { type: "object" } })) })) };
    const toolReply = (name: string, args: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [
      { id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }
    ] } }] }));
    const finalReply = () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "Afirmación inventada por el modelo." } }] }));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(toolReply("recommend_movies", {})).mockResolvedValueOnce(finalReply())
      .mockResolvedValueOnce(toolReply("search_books", { query: "Dune Frank Herbert" }))
      .mockResolvedValueOnce(toolReply("compare_movie_book", { movie_id: movie.id, book_id: book.id })).mockResolvedValueOnce(finalReply());
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
    expect(host.textContent).not.toContain("Afirmación inventada");
    expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ name: "compare_movie_book", arguments: { movie_id: movie.id, book_id: book.id } }), expect.anything());
    await send(host, "Abre IMDb de Dune (2021)");
    await vi.waitFor(() => expect(popups[0]!.location.replace).toHaveBeenCalledWith("https://www.imdb.com/title/tt1160419/"));
    await send(host, "1. Abre Google Books del libro de Dune");
    await vi.waitFor(() => expect(popups[1]!.location.replace).toHaveBeenCalledWith("https://books.google.com/books?id=Dune_Book"));
    expect(open).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(call).toHaveBeenCalledTimes(3);
    expect(gateway.open).toHaveBeenCalledTimes(2);
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
