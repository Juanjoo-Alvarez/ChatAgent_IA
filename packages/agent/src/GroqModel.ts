import { z } from "zod";
import { Ajv } from "ajv";
import { setTimeout as delay } from "node:timers/promises";
import { AgentError, type LanguageModel, type ModelMessage, type ToolDefinition } from "./types.js";

const responseSchema = z.object({ choices: z.array(z.object({
  finish_reason: z.enum(["stop", "tool_calls", "length"]),
  message: z.object({ content: z.string().max(12000).nullish(), tool_calls: z.array(z.object({
    id: z.string().min(1), type: z.literal("function"),
    function: z.object({ name: z.string().min(1).max(100), arguments: z.string().max(16000) })
  })).max(3).optional() })
})).length(1) });

const toolValidationErrorSchema = z.object({ error: z.object({ code: z.literal("tool_use_failed") }) });
const truncatedResponseSchema = z.object({ choices: z.array(z.object({ finish_reason: z.literal("length") })).length(1) });
const toolCorrection = {
  role: "system",
  content: "La llamada anterior no cumplió el esquema de las herramientas. Genera una llamada válida usando únicamente las herramientas disponibles y los tipos definidos en su esquema. Si un parámetro opcional no tiene valor, omite la propiedad; no envíes null. No inventes resultados de herramientas."
};

/** Solo inferencia: las herramientas se ejecutan en nuestro backend mediante MCP. */
export class GroqModel implements LanguageModel {
  public constructor(private readonly options: {
    readonly apiKey: string;
    readonly model: string;
    readonly fetch?: typeof fetch;
    readonly onRateLimit?: (event: {
      readonly retryAfterSeconds: number | null;
      readonly remainingRequests: number | null;
      readonly remainingTokens: number | null;
    }) => void;
  }) {
    if (!options.apiKey.trim() || !options.model.trim()) { throw new Error("Groq requires an API key and model"); }
  }

  public async complete(messages: readonly ModelMessage[], tools: readonly ToolDefinition[], signal: AbortSignal) {
    signal.throwIfAborted();
    try {
      const body = {
        model: this.options.model, stream: false, temperature: 0, max_completion_tokens: 2048,
        ...(this.options.model.startsWith("openai/gpt-oss-") ? { reasoning_effort: "low" } : {}),
        messages: messages.map((message) => {
          if (message.role === "tool") {
            if (message.toolCallId === undefined) { throw new AgentError("unavailable"); }
            return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
          }
          return { role: message.role, content: message.content,
            ...(message.toolCalls === undefined ? {} : { tool_calls: message.toolCalls.map((call) => {
              if (call.id === undefined) { throw new AgentError("unavailable"); }
              return { id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } };
            }) }) };
        }),
        ...(tools.length === 0 ? {} : {
          tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })),
          tool_choice: "auto", parallel_tool_calls: false
        })
      };
      const request: RequestInit = {
        method: "POST", redirect: "error", signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify(body)
      };
      const ajv = new Ajv({ strict: false, allErrors: false, validateFormats: false });
      const validators = new Map(tools.map((tool) => [tool.name, ajv.compile(tool.inputSchema)]));
      let correction: typeof toolCorrection | undefined;
      let correctionUsed = false;
      // Hasta dos esperas breves por 429 y una corrección; máximo tres solicitudes.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        signal.throwIfAborted();
        const response = await (this.options.fetch ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
          ...request, body: JSON.stringify({ ...body, messages: correction === undefined ? body.messages : [...body.messages, correction] })
        });
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const seconds = retryAfter === null || !retryAfter.trim() ? NaN : Number(retryAfter);
          const remaining = (name: string) => {
            const value = response.headers.get(name);
            if (value === null || !value.trim()) { return null; }
            const parsed = Number(value);
            return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
          };
          this.options.onRateLimit?.({
            retryAfterSeconds: Number.isFinite(seconds) && seconds >= 0 ? seconds : null,
            remainingRequests: remaining("x-ratelimit-remaining-requests"),
            remainingTokens: remaining("x-ratelimit-remaining-tokens")
          });
          await response.body?.cancel();
          if (attempt < 2 && Number.isFinite(seconds) && seconds >= 0 && seconds <= 30) {
            await delay(Math.max(250, seconds * 1000 + 250), undefined, { signal });
            continue;
          }
          throw new AgentError("rate_limited");
        }
        if (response.status === 400 && tools.length > 0 && !correctionUsed && attempt < 2) {
          const failure: unknown = await response.json().catch(() => null);
          if (toolValidationErrorSchema.safeParse(failure).success) { correction = toolCorrection; correctionUsed = true; continue; }
        }
        if (!response.ok) { throw new AgentError("unavailable"); }
        const raw: unknown = await response.json();
        if (truncatedResponseSchema.safeParse(raw).success) {
          if (correctionUsed || attempt === 2) { throw new AgentError("unavailable"); }
          correction = { role: "system", content: "La respuesta anterior se truncó y fue descartada. Responde brevemente o genera una única llamada válida. No reconstruyas ni inventes resultados de herramientas." };
          correctionUsed = true;
          continue;
        }
        const choice = responseSchema.parse(raw).choices[0]!;
        try {
          const calls = choice.message.tool_calls ?? [];
          if (new Set(calls.map((call) => call.id)).size !== calls.length
            || (choice.finish_reason === "tool_calls") !== (calls.length > 0)) { throw new Error("invalid_calls"); }
          const toolCalls = calls.map((call) => {
            const args = z.record(z.string(), z.unknown()).parse(JSON.parse(call.function.arguments));
            if (!validators.get(call.function.name)?.(args)) { throw new Error("invalid_arguments"); }
            return { id: call.id, name: call.function.name, arguments: args };
          });
          const content = choice.message.content ?? "";
          if (toolCalls.length === 0 && !content.trim()) { throw new Error("empty_response"); }
          signal.throwIfAborted();
          return { content, toolCalls };
        } catch {
          signal.throwIfAborted();
          if (correctionUsed || attempt === 2) { throw new AgentError("unavailable"); }
          correction = toolCorrection;
          correctionUsed = true;
        }
      }
      throw new AgentError("unavailable");
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof AgentError && error.code === "rate_limited") { throw error; }
      throw new AgentError("unavailable");
    }
  }
}
