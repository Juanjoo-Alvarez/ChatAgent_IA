import { describe, expect, it, vi } from "vitest";

import { AgentError, FixtureModel, MovieAgent, OllamaModel } from "../src/index.js";
import { collectEvidence, safeOutput, SYSTEM_PROMPT } from "../src/policy.js";
import { fixtures, movie, recommendCall, signal } from "./helpers.js";

describe("MovieAgent", () => {
  it("uses tools, isolates external data and returns validated movie cards", async () => {
    const f = fixtures([recommendCall, { content: "Marea alta puede interesarte.", toolCalls: [] }]);
    const reply = await new MovieAgent(f.model, f.gateway).respond({ content: "Recomienda drama", history: [], signal: signal() });
    expect(reply.movies).toEqual([{ id: 501, title: "Marea alta", year: 2018, poster: movie.poster, imdbId: "tt9950101" }]);
    expect(reply.references).toEqual([{ provider: "imdb", id: "tt9950101" }]);
    expect(reply.actions).toEqual([]);
    expect(f.model.complete).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ role: "tool", content: expect.stringContaining('"trust":"untrusted_external"') })]), f.session.tools, expect.any(AbortSignal));
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
    await expect(new MovieAgent(f.model, f.gateway).respond({ content: "Hola", history: [], signal: signal() })).rejects.toMatchObject({ code });
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it("bounds repeated tool calls", async () => {
    const f = fixtures([recommendCall]);
    await expect(new MovieAgent(f.model, f.gateway, 2).respond({ content: "Hola", history: [], signal: signal() })).rejects.toMatchObject({ code: "limit_exceeded" });
    expect(f.session.call).toHaveBeenCalledTimes(2);
  });
  it("does not turn tool errors into evidence", async () => {
    const f = fixtures([recommendCall, { content: "La consulta no está disponible.", toolCalls: [] }]);
    vi.mocked(f.session.call).mockResolvedValue({ isError: true, data: { movie } });
    expect((await new MovieAgent(f.model, f.gateway).respond({ content: "Hola", history: [], signal: signal() })).movies).toEqual([]);
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
      await expect(new MovieAgent(f.model, f.gateway).respond({ content: "Hola", history: [], signal: controller.signal })).rejects.toBeDefined();
      expect(f.session.close).toHaveBeenCalledOnce();
    }
  });
  it("does not open MCP for an already cancelled turn", async () => {
    const f = fixtures();
    const controller = new AbortController(); controller.abort();
    await expect(new MovieAgent(f.model, f.gateway).respond({ content: "Hola", history: [], signal: controller.signal })).rejects.toBeDefined();
    expect(f.gateway.open).not.toHaveBeenCalled();
  });
  it("opens a known reference requested in ordinary chat and clarifies unknown targets", async () => {
    const f = fixtures();
    const agent = new MovieAgent(f.model, f.gateway);
    const reference = { provider: "imdb" as const, id: "tt9950101" };
    const result = await agent.respond({ content: "Abre IMDb", history: [{ user: "Una película", assistant: "Marea alta", references: [reference] }], signal: signal() });
    expect(result.actions).toEqual([{ type: "open-reference", reference }]);
    const unclear = await agent.respond({ content: "Abre Google Books", history: [], signal: signal() });
    expect(unclear.actions).toEqual([]);
    expect(unclear.content).toContain("referencia identificada");
  });
});

describe("output and evidence policy", () => {
  it.each([null, "text", {}, { results: [null, "text", { ...movie, poster: "https://evil.invalid" }] }])("ignores unstructured or invalid evidence", (data) => {
    expect(collectEvidence(data).movies).toEqual([]);
  });
  it("handles missing optional fields and explicit book references", () => {
    expect(collectEvidence({ movie: { id: 1, title: "Película" }, references: [{ provider: "google-books", id: "volume_1" }, { provider: "evil", id: "x" }] })).toEqual({ movies: [{ id: 1, title: "Película", year: null, poster: null, imdbId: null }], references: [{ provider: "google-books", id: "volume_1" }] });
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
