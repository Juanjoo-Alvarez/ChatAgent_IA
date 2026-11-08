import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Ajv, type ValidateFunction } from "ajv";

import { AgentError, type ToolCall, type ToolGateway, type ToolSession } from "./types.js";

const descriptions: Record<string, string> = {
  search_movies: "Busca películas por título y año. Pregunta si hay varias coincidencias.",
  get_movie_details: "Obtiene detalles de una película e identificador IMDb a partir de movie_id.",
  recommend_movies: "Obtiene candidatos de películas filtrados por preferencias; evalúalos antes de recomendar.",
  search_books: "Busca libros. No asumas que un resultado es la adaptación de una película sin evidencia.",
  get_book_details: "Consulta detalles y fuentes de un libro.",
  compare_movie_book: "Compara una película y un libro utilizando evidencia de la adaptación."
};

/** Una conexión MCP por turno; no comparte contexto de usuarios entre clientes. */
export class McpGateway implements ToolGateway {
  public constructor(private readonly url: string, private readonly timeoutMs = 10000) {}

  public async open(signal: AbortSignal): Promise<ToolSession> {
    const client = new Client({ name: "agichat-agent", version: "0.2.1" });
    const transport = new StreamableHTTPClientTransport(new URL(this.url));
    const onAbort = () => { void client.close(); };
    signal.addEventListener("abort", onAbort, { once: true });
    const close = async () => { signal.removeEventListener("abort", onAbort); await client.close(); };
    try {
      signal.throwIfAborted();
      await client.connect(transport, { timeout: this.timeoutMs, signal });
      const list = await client.listTools({}, { timeout: this.timeoutMs, signal });
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
          const result = await client.callTool({ name: call.name, arguments: call.arguments }, undefined, { timeout: this.timeoutMs, signal: callSignal });
          // No reenviar errores internos, URLs de configuración o credenciales al LLM.
          if (result.isError === true) { return { isError: true, data: { error: "tool_unavailable" } }; }
          if (result.structuredContent === undefined) { throw new AgentError("unavailable"); }
          return { isError: false, data: result.structuredContent };
        },
        close
      };
    } catch {
      await close();
      signal.throwIfAborted();
      throw new AgentError("unavailable");
    }
  }
}
