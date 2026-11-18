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
const MAX_RATE_LIMIT_RETRY_SECONDS = 1;
const MAX_COOLDOWN_SECONDS = 60;
const toolCorrection = {
  role: "system",
  content: "La llamada anterior no cumplió el esquema de las herramientas. Genera una llamada válida usando únicamente las herramientas disponibles y los tipos definidos en su esquema. Si un parámetro opcional no tiene valor, omite la propiedad; no envíes null. No inventes resultados de herramientas."
};

/** Solo inferencia: las herramientas se ejecutan en nuestro backend mediante MCP. */
export class GroqModel implements LanguageModel {
  private retryAt = 0;

  public constructor(private readonly options: {
    readonly apiKey: string;
    readonly model: string;
    readonly fetch?: typeof fetch;
    readonly timeoutMs?: number;
    readonly onRateLimit?: (event: {
      readonly retryAfterSeconds: number | null;
      readonly remainingRequests: number | null;
      readonly remainingTokens: number | null;
    }) => void;
  }) {
    if (!options.apiKey.trim() || !options.model.trim()) { throw new Error("Groq requires an API key and model"); }
  }

  public async complete(messages: readonly ModelMessage[], tools: readonly ToolDefinition[], turnSignal: AbortSignal, onInference?: () => void) {
    turnSignal.throwIfAborted();
    if (Date.now() < this.retryAt) { throw new AgentError("rate_limited"); }
    const deadline = AbortSignal.timeout(this.options.timeoutMs ?? 8000);
    const signal = AbortSignal.any([turnSignal, deadline]);
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` }
      };
      const ajv = new Ajv({ strict: false, allErrors: false, validateFormats: false });
      const validators = new Map(tools.map((tool) => [tool.name, ajv.compile(tool.inputSchema)]));
      let correction: typeof toolCorrection | undefined;
      // Una sola repetición por inferencia: corrección o espera breve por cuota.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        signal.throwIfAborted();
        if (Date.now() < this.retryAt) { throw new AgentError("rate_limited"); }
        const history = correction === undefined ? body.messages : [
          { role: "system", content: [body.messages[0]?.role === "system" ? body.messages[0].content : "", correction.content].filter(Boolean).join("\n") },
          ...body.messages.slice(body.messages[0]?.role === "system" ? 1 : 0)
        ];
        onInference?.();
        const response = await (this.options.fetch ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
          ...request, body: JSON.stringify({ ...body, messages: history })
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
          if (Number.isFinite(seconds) && seconds > 0) {
            this.retryAt = Math.max(this.retryAt, Date.now() + Math.min(seconds, MAX_COOLDOWN_SECONDS) * 1000);
          }
          await response.body?.cancel().catch(() => undefined);
          if (attempt === 0 && Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_RATE_LIMIT_RETRY_SECONDS) {
            await delay(Math.max(250, seconds * 1000 + 250), undefined, { signal });
            continue;
          }
          throw new AgentError("rate_limited");
        }
        if (response.status === 400 && tools.length > 0 && attempt === 0) {
          const failure: unknown = await response.json().catch(() => null);
          if (toolValidationErrorSchema.safeParse(failure).success) { correction = toolCorrection; continue; }
        }
        if (!response.ok) {
          if (!response.bodyUsed) { await response.body?.cancel().catch(() => undefined); }
          throw new AgentError("unavailable");
        }
        const raw: unknown = await response.json();
        if (truncatedResponseSchema.safeParse(raw).success) {
          if (attempt === 1) { throw new AgentError("unavailable"); }
          correction = { role: "system", content: "La respuesta anterior se truncó y fue descartada. Responde brevemente o genera una única llamada válida. No reconstruyas ni inventes resultados de herramientas." };
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
          if (attempt === 1) { throw new AgentError("unavailable"); }
          correction = toolCorrection;
        }
      }
      throw new AgentError("unavailable");
    } catch (error) {
      turnSignal.throwIfAborted();
      if (deadline.aborted) { throw new AgentError("timeout"); }
      if (error instanceof AgentError && error.code === "rate_limited") { throw error; }
      throw new AgentError("unavailable");
    }
  }
}
