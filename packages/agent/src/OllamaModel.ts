import { z } from "zod";

import { AgentError, type LanguageModel, type ModelMessage, type ToolDefinition } from "./types.js";

const responseSchema = z.object({
  message: z.object({
    content: z.string().max(12000),
    tool_calls: z.array(z.object({ function: z.object({ name: z.string().min(1).max(100), arguments: z.record(z.string(), z.unknown()) }) })).max(3).optional()
  })
});

export class OllamaModel implements LanguageModel {
  public constructor(private readonly options: { readonly url: string; readonly model: string; readonly fetch?: typeof fetch }) {}

  public async complete(messages: readonly ModelMessage[], tools: readonly ToolDefinition[], signal: AbortSignal) {
    signal.throwIfAborted();
    const response = await (this.options.fetch ?? fetch)(new URL("/api/chat", this.options.url), {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({
        model: this.options.model, stream: false, think: false,
        options: { temperature: 0, num_predict: 1024, num_ctx: 8192 },
        messages: messages.map((message) => ({
          role: message.role, content: message.content,
          ...(message.toolName === undefined ? {} : { tool_name: message.toolName }),
          ...(message.toolCalls === undefined ? {} : { tool_calls: message.toolCalls.map((call) => ({ type: "function", function: call })) })
        })),
        tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }))
      })
    });
    if (!response.ok) { throw new AgentError("unavailable"); }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) { throw new AgentError("unavailable"); }
    return { content: parsed.data.message.content, toolCalls: parsed.data.message.tool_calls?.map((call) => call.function) ?? [] };
  }
}
