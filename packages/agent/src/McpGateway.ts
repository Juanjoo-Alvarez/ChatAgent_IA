import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { Ajv, type ValidateFunction } from "ajv";

import { AgentError, type ToolCall, type ToolGateway, type ToolSession } from "./types.js";

const descriptions: Record<string, string> = {
  search_movies: "Busca películas por título y año. Pregunta si hay varias coincidencias.",
  get_movie_details: "Obtiene detalles de una película e identificador IMDb a partir de movie_id.",
  recommend_movies: "Obtiene candidatos de películas filtrados por preferencias; evalúalos antes de recomendar.",
  search_books: "Busca libros. No asumas que un resultado es la adaptación de una película sin evidencia.",
  get_book_details: "Consulta detalles y fuentes de un libro.",
  compare_movie_book: "Compara por movie_id de TMDB. Omite book_id para descubrir automáticamente la obra de origen y su edición. Inclúyelo solo para comparar un libro concreto."
};

function providerFailure(content: unknown): { code?: string; source?: "wikidata" | "tmdb" } {
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  if (typeof first !== "object" || first === null || !("type" in first) || first.type !== "text"
    || !("text" in first) || typeof first.text !== "string" || first.text.length > 16000) { return {}; }
  try {
    const payload = JSON.parse(first.text) as { error?: { code?: unknown; source?: unknown } } | null;
    return { ...(typeof payload?.error?.code === "string" ? { code: payload.error.code } : {}),
      ...(payload?.error?.source === "wikidata" ? { source: "wikidata" as const } : payload?.error?.source === "tmdb" ? { source: "tmdb" as const } : {}) };
  } catch { return {}; }
}

/** Una conexión MCP por turno; no comparte contexto de usuarios entre clientes. */
export class McpGateway implements ToolGateway {
  public constructor(private readonly url: string, private readonly timeoutMs = 18000) {}

  public async open(signal: AbortSignal): Promise<ToolSession> {
    const client = new Client({ name: "agichat-agent", version: "0.2.1" });
    const transport = new StreamableHTTPClientTransport(new URL(this.url));
    const onAbort = () => { void client.close().catch(() => undefined); };
    signal.addEventListener("abort", onAbort, { once: true });
    const close = async () => { signal.removeEventListener("abort", onAbort); await client.close(); };
    try {
      signal.throwIfAborted();
      const connectionSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.min(this.timeoutMs, 10000))]);
      await client.connect(transport, { timeout: this.timeoutMs, signal: connectionSignal });
      const list = await client.listTools({}, { timeout: this.timeoutMs, signal: connectionSignal });
      const ajv = new Ajv({ strict: false, allErrors: false, validateFormats: false });
      const validators = new Map<string, ValidateFunction>();
      const tools = list.tools.filter((tool) => Object.hasOwn(descriptions, tool.name) && tool.annotations?.readOnlyHint === true).map((tool) => {
        validators.set(tool.name, ajv.compile(tool.inputSchema));
        return { name: tool.name, description: descriptions[tool.name] as string, inputSchema: tool.inputSchema };
      });
      return {
        tools,
        call: async (call: ToolCall, callSignal: AbortSignal) => {
          callSignal.throwIfAborted();
          const validator = validators.get(call.name);
          if (validator === undefined || !validator(call.arguments)) { throw new AgentError("policy_denied"); }
          const source = ["recommend_movies", "search_movies", "get_movie_details"].includes(call.name) ? "tmdb" : "google-books";
          try {
            const result = await client.callTool({ name: call.name, arguments: call.arguments }, undefined, { timeout: this.timeoutMs, signal: callSignal });
            if (result.isError === true) {
              const failure = providerFailure(result.content);
              const error = new AgentError(failure.code === "timeout" ? "timeout"
                : failure.code === "rate_limited" || failure.code === "quota_exhausted" ? "rate_limited" : "unavailable", failure.source ?? source);
              return { isError: true, data: { error: "tool_unavailable" }, error };
            }
            if (result.structuredContent === undefined) { throw new AgentError("unavailable", source); }
            return { isError: false, data: result.structuredContent };
          } catch (error) {
            callSignal.throwIfAborted();
            throw new AgentError(error instanceof McpError && error.code === ErrorCode.RequestTimeout ? "timeout" : "unavailable", source);
          }
        },
        close
      };
    } catch (error) {
      await close().catch(() => undefined);
      signal.throwIfAborted();
      throw new AgentError((error instanceof McpError && error.code === ErrorCode.RequestTimeout)
        || (error instanceof Error && error.name === "TimeoutError") ? "timeout" : "unavailable");
    }
  }
}
