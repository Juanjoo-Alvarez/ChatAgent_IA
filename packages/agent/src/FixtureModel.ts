import type { LanguageModel, ModelMessage, ToolDefinition } from "./types.js";

/** Modo explícito de integración; no es un LLM ni demuestra resistencia del modelo. */
export class FixtureModel implements LanguageModel {
  public complete(messages: readonly ModelMessage[], tools: readonly ToolDefinition[], signal: AbortSignal) {
    signal.throwIfAborted();
    if (messages.at(-1)?.role === "tool") {
      return Promise.resolve({ content: "[Modo fixture: sin LLM] Estos son los resultados de las herramientas. Puedes solicitar detalles o una comparación cuando esté integrada la herramienta de libros.", toolCalls: [] });
    }
    return Promise.resolve({
      content: "",
      toolCalls: tools.some((tool) => tool.name === "recommend_movies") ? [{ name: "recommend_movies", arguments: {} }] : []
    });
  }
}
