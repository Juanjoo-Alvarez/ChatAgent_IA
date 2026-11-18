import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import { AgentError, type LanguageModel, type ModelMessage, type ToolDefinition } from "./types.js";

const responseSchema = z.object({ choices: z.array(z.object({
  finish_reason: z.enum(["stop", "tool_calls"]),
  message: z.object({ content: z.string().max(12000).nullish(), tool_calls: z.array(z.object({
    id: z.string().min(1), type: z.literal("function"),
    function: z.object({ name: z.string().min(1).max(100), arguments: z.string().max(16000) })
  })).max(3).optional() })
})).length(1) });

const toolValidationErrorSchema = z.object({ error: z.object({ code: z.literal("tool_use_failed") }) });
const toolCorrection = {
  role: "system",
  content: "La llamada anterior no cumplió el esquema de las herramientas. Genera una llamada válida usando únicamente las herramientas disponibles y los tipos definidos en su esquema. Si un parámetro opcional no tiene valor, omite la propiedad; no envíes null. No inventes resultados de herramientas."
};

/** Solo inferencia: las herramientas se ejecutan en nuestro backend mediante MCP. */
export class GroqModel implements LanguageModel {
  public constructor(private readonly options: { readonly apiKey: string; readonly model: string; readonly fetch?: typeof fetch }) {
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
      const send = () => (this.options.fetch ?? fetch)("https://api.groq.com/openai/v1/chat/completions", request);
      let response = await send();
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        // Solo un reintento, con espera explícita y acotada; respeta cancelación.
        if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 30) {
          await response.body?.cancel();
          await delay(Math.max(100, seconds * 1000), undefined, { signal });
          response = await send();
        }
      }
      if (response.status === 400 && tools.length > 0) {
        const failure: unknown = await response.json().catch(() => null);
        if (toolValidationErrorSchema.safeParse(failure).success) {
          // Una sola corrección. Nunca ejecutar failed_generation ni reenviar el error privado.
          signal.throwIfAborted();
          response = await (this.options.fetch ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
            ...request, body: JSON.stringify({ ...body, messages: [...body.messages, toolCorrection] })
          });
        }
      }
      if (response.status === 429) { throw new AgentError("rate_limited"); }
      // No reenviar cuerpos de error del proveedor.
      if (!response.ok) { throw new AgentError("unavailable"); }
      const parsed = responseSchema.parse(await response.json());
      const message = parsed.choices[0]!.message;
      const calls = message.tool_calls ?? [];
      if (new Set(calls.map((call) => call.id)).size !== calls.length) { throw new AgentError("unavailable"); }
      return { content: message.content ?? "", toolCalls: calls.map((call) => ({
        id: call.id, name: call.function.name,
        arguments: z.record(z.string(), z.unknown()).parse(JSON.parse(call.function.arguments))
      })) };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof AgentError && error.code === "rate_limited") { throw error; }
      throw new AgentError("unavailable");
    }
  }
}
