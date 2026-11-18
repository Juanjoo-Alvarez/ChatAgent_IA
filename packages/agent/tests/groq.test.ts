import { describe, expect, it, vi } from "vitest";
import { GroqModel, MovieAgent } from "../src/index.js";
import { fixtures, movie, signal } from "./helpers.js";

const tool = { id: "call_123", type: "function", function: { name: "recommend_movies", arguments: "{}" } };
const response = (content: string | null, calls?: unknown[]) => new Response(JSON.stringify({ choices: [{ finish_reason: calls ? "tool_calls" : "stop", message: { content, ...(calls ? { tool_calls: calls } : {}) } }] }));
const modelWith = (fetchImpl: typeof fetch, model = "openai/gpt-oss-20b") => new GroqModel({ apiKey: "synthetic-private-key", model, fetch: fetchImpl });
const toolFailure = () => new Response(JSON.stringify({ error: {
  code: "tool_use_failed", message: "private provider error", failed_generation: "private rejected tool call"
} }), { status: 400 });

describe("Groq inference", () => {
  it("accepts tool calls without content, as returned by GPT OSS, and discards reasoning", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{
      finish_reason: "tool_calls", message: { role: "assistant", reasoning: "private reasoning", tool_calls: [tool] }
    }] })));
    const result = await modelWith(fetchImpl).complete([], fixtures().session.tools, signal());
    expect(result).toEqual({ content: "", toolCalls: [{ id: "call_123", name: "recommend_movies", arguments: {} }] });
    expect(JSON.stringify(result)).not.toContain("private reasoning");
  });
  it("completes a real agent loop with correlated tool IDs, evidence and MCP cleanup", async () => {
    const f = fixtures();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response(null, [tool])).mockResolvedValueOnce(response("Te recomiendo Marea alta."));
    const reply = await new MovieAgent(modelWith(fetchImpl), f.gateway).respond({ content: "Busca Marea alta", history: [], signal: signal() });
    expect(reply.movies[0]?.poster).toBe(movie.poster);
    expect(f.session.call).toHaveBeenCalledWith({ id: "call_123", name: "recommend_movies", arguments: {} }, expect.any(AbortSignal));
    expect(f.session.close).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer synthetic-private-key" } });
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ model: "openai/gpt-oss-20b", reasoning_effort: "low", parallel_tool_calls: false });
    expect(body.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "assistant", tool_calls: [tool] }),
      expect.objectContaining({ role: "tool", tool_call_id: "call_123", content: expect.stringContaining("untrusted_external") })
    ]));
    expect(JSON.stringify(body)).not.toContain("synthetic-private-key");
  });
  it("omits tool definitions for final text and model-specific reasoning for other models", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response("Hola"));
    expect(await modelWith(fetchImpl, "another-model").complete([{ role: "user", content: "Hola" }], [], signal())).toEqual({ content: "Hola", toolCalls: [] });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string);
    expect(body.tools).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });
  it("repairs a rejected tool call on a follow-up turn without losing history or executing rejected arguments", async () => {
    const f = fixtures();
    const history = [{ user: "Recomiéndame una película basada en un libro.", assistant: "¿Qué tema te interesa?", references: [] }];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(toolFailure())
      .mockResolvedValueOnce(response(null, [tool])).mockResolvedValueOnce(response("Te recomiendo Marea alta."));
    const reply = await new MovieAgent(modelWith(fetchImpl), f.gateway).respond({ content: "¿Hay alguna de deportes?", history, signal: signal() });
    expect(reply.movies[0]?.id).toBe(movie.id);
    expect(f.session.call).toHaveBeenCalledOnce();
    expect(f.session.call).toHaveBeenCalledWith({ id: tool.id, name: tool.function.name, arguments: {} }, expect.any(AbortSignal));
    expect(f.session.close).toHaveBeenCalledOnce();
    const initial = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string);
    const retried = JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string);
    expect(retried).toEqual({ ...initial, messages: [
      { role: "system", content: expect.stringContaining(`${initial.messages[0].content}\nLa llamada anterior`) }, ...initial.messages.slice(1)
    ] });
    expect(initial.messages).toEqual(expect.arrayContaining([
      { role: "user", content: history[0]!.user }, { role: "assistant", content: history[0]!.assistant },
      { role: "user", content: "¿Hay alguna de deportes?" }
    ]));
    expect(JSON.stringify(retried)).not.toContain("private");
    expect(history).toHaveLength(1);
  });
  it.each([400, 429, 500])("stops after one tool correction and handles HTTP %s", async (status) => {
    const f = fixtures();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(toolFailure())
      .mockResolvedValueOnce(status === 400 ? toolFailure() : new Response("private", { status }));
    await expect(new MovieAgent(modelWith(fetchImpl), f.gateway).respond({ content: "Deportes", history: [], signal: signal() }))
      .rejects.toMatchObject({ code: status === 429 ? "rate_limited" : "unavailable" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(f.session.call).not.toHaveBeenCalled();
    expect(f.session.close).toHaveBeenCalledOnce();
  });
  it.each(["not json", "null", JSON.stringify({ error: { code: "invalid_request_error" } })])("does not retry other or malformed HTTP 400 errors", async (body) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 400 }));
    await expect(modelWith(fetchImpl).complete([], fixtures().session.tools, signal())).rejects.toMatchObject({ code: "unavailable" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("does not retry tool validation failures when no tools are offered", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(toolFailure());
    await expect(modelWith(fetchImpl).complete([], [], signal())).rejects.toMatchObject({ code: "unavailable" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("preserves cancellation during a tool correction", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(toolFailure()).mockImplementationOnce(async (_url, init) => {
      controller.abort();
      expect(init?.signal?.aborted).toBe(true);
      throw new Error("private");
    });
    await expect(modelWith(fetchImpl).complete([], fixtures().session.tools, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it.each([401, 500])("redacts HTTP %s errors without retrying", async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("synthetic-private-key", { status }));
    await expect(modelWith(fetchImpl).complete([], [], signal())).rejects.toMatchObject({ code: "unavailable", message: "unavailable" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it.each([null, "invalid", "6", "90", "-1"])("reports quota exhaustion without retrying an unsuitable delay %s", async (retryAfter) => {
    const headers = retryAfter === null ? {} : { "retry-after": retryAfter };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("private", { status: 429, headers }));
    await expect(modelWith(fetchImpl).complete([], [], signal())).rejects.toMatchObject({ code: "rate_limited" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("reports only bounded rate-limit headers without exposing the response body", async () => {
    const onRateLimit = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("private-provider-error", {
      status: 429, headers: {
        "retry-after": "90", "x-ratelimit-remaining-requests": "999",
        "x-ratelimit-remaining-tokens": "not-a-number"
      }
    }));
    const model = new GroqModel({ apiKey: "synthetic-private-key", model: "openai/gpt-oss-120b", fetch: fetchImpl, onRateLimit });
    await expect(model.complete([], [], signal())).rejects.toMatchObject({ code: "rate_limited" });
    expect(onRateLimit).toHaveBeenCalledExactlyOnceWith({
      retryAfterSeconds: 90, remainingRequests: 999, remainingTokens: null
    });
    expect(JSON.stringify(onRateLimit.mock.calls)).not.toContain("private-provider-error");
  });
  it.each([200, 429])("bounds retries for HTTP 429 followed by status %s", async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(status === 200 ? response("Hola") : new Response("", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response("", { status: 429 }));
    const result = modelWith(fetchImpl).complete([], [], signal());
    if (status === 200) { expect((await result).content).toBe("Hola"); }
    else { await expect(result).rejects.toMatchObject({ code: "rate_limited" }); }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("returns long rate limits promptly and shares the cooldown across turns", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "2.1" } }));
    const model = modelWith(fetchImpl);
    await expect(model.complete([], [], signal())).rejects.toMatchObject({ code: "rate_limited" });
    await expect(model.complete([], [], signal())).rejects.toMatchObject({ code: "rate_limited" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("cancels the quota wait without sending another request", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "1" } }));
    const pending = modelWith(fetchImpl).complete([], [], controller.signal);
    const rejected = expect(pending).rejects.toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await rejected;
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it.each(["not json", JSON.stringify({ choices: [] }), JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "truncated" } }] })])("rejects malformed or truncated output", async (body) => {
    await expect(modelWith(vi.fn().mockResolvedValue(new Response(body))).complete([], [], signal())).rejects.toMatchObject({ code: "unavailable" });
  });
  it.each(["invalid", "[]", "null"]) ("rejects invalid tool arguments %s", async (args) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(null, [{ ...tool, function: { ...tool.function, arguments: args } }]));
    await expect(modelWith(fetchImpl).complete([], [], signal())).rejects.toMatchObject({ code: "unavailable" });
  });
  it("rejects duplicate IDs and missing correlation in history", async () => {
    await expect(modelWith(vi.fn().mockResolvedValue(response(null, [tool, tool]))).complete([], [], signal())).rejects.toMatchObject({ code: "unavailable" });
    for (const messages of [[{ role: "tool" as const, content: "{}" }], [{ role: "assistant" as const, content: "", toolCalls: [{ name: "test", arguments: {} }] }]]) {
      const fetchImpl = vi.fn();
      await expect(modelWith(fetchImpl).complete(messages, [], signal())).rejects.toMatchObject({ code: "unavailable" });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
  it("propagates cancellation before and during fetch, and redacts network errors", async () => {
    const aborted = AbortSignal.abort();
    const fetchImpl = vi.fn();
    await expect(modelWith(fetchImpl).complete([], [], aborted)).rejects.toBe(aborted.reason);
    expect(fetchImpl).not.toHaveBeenCalled();
    const controller = new AbortController();
    const cancelling = vi.fn(async () => { controller.abort(); throw new Error("private"); });
    await expect(modelWith(cancelling).complete([], [], controller.signal)).rejects.toBe(controller.signal.reason);
    await expect(modelWith(vi.fn().mockRejectedValue(new Error("private"))).complete([], [], signal())).rejects.toMatchObject({ message: "unavailable" });
  });
  it("requires credentials and a model without exposing values", () => {
    expect(() => new GroqModel({ apiKey: " ", model: "test" })).toThrow("requires");
    expect(() => new GroqModel({ apiKey: "test", model: " " })).toThrow("requires");
  });
  it.each(["{bad", "[]", "null", '{"year":null}'])("repairs invalid successful calls once without executing them: %s", async (args) => {
    const tools = [{ name: "recommend_movies", description: "", inputSchema: { type: "object", properties: { year: { type: "integer" } }, additionalProperties: false } }];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response(null, [{ ...tool, function: { ...tool.function, arguments: args } }]))
      .mockResolvedValueOnce(response(null, [tool]));
    expect((await modelWith(fetchImpl).complete([], tools, signal())).toolCalls[0]?.arguments).toEqual({});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string).messages).toEqual([{ role: "system", content: expect.stringContaining("no envíes null") }]);
  });
  it("discards a truncated call and recovers with one fresh completion", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "Inventado", tool_calls: [tool] } }] })))
      .mockResolvedValueOnce(response("Respuesta breve"));
    expect(await modelWith(fetchImpl).complete([], [], signal())).toEqual({ content: "Respuesta breve", toolCalls: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]![1]!.body).not.toContain("Inventado");
  });
  it("uses one shared retry allowance for rate limits and tool corrections", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(toolFailure()).mockResolvedValueOnce(response("Hola"));
    await expect(modelWith(fetchImpl).complete([], fixtures().session.tools, signal())).rejects.toMatchObject({ code: "unavailable" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("caps inference time independently of the turn so MCP recovery still has time", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const deadline = init!.signal!;
      return await new Promise<Response>((_resolve, reject) => {
        deadline.addEventListener("abort", () => reject(deadline.reason), { once: true });
      });
    });
    const model = new GroqModel({ apiKey: "synthetic", model: "test", timeoutMs: 25, fetch: fetchImpl });
    const f = fixtures();
    const turn = signal();
    const reply = await new MovieAgent(model, f.gateway).respond({ content: "Recomiéndame una película", history: [], signal: turn });
    expect(turn.aborted).toBe(false);
    expect(reply.movies[0]?.id).toBe(movie.id);
    expect(f.session.call).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("rejects unoffered tools, duplicate IDs, empty completions and repeated truncation after two attempts", async () => {
    for (const make of [() => response(null, [tool]), () => response(null, [tool, tool]), () => response(""),
      () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "partial" } }] }))]) {
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => make());
      await expect(modelWith(fetchImpl).complete([], [], signal())).rejects.toMatchObject({ code: "unavailable" });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  });
});
