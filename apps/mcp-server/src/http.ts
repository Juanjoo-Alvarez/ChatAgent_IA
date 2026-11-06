import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { Logger } from "./logger.js";

export const DEFAULT_MCP_PATH = "/mcp";

export interface McpHttpServerOptions {
  /** Crea una instancia por solicitud; el modo sin sesión no comparte estado. */
  readonly createMcpServer: () => McpServer;
  readonly logger: Logger;
  readonly path?: string | undefined;
  /** Si se define, se rechazan cabeceras Host fuera de la lista (protección DNS rebinding). */
  readonly allowedHosts?: readonly string[] | undefined;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

function jsonRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  sendJson(res, status, { jsonrpc: "2.0", error: { code, message }, id: null });
}

/**
 * Servidor HTTP con transporte MCP Streamable HTTP en modo sin sesión: cada
 * POST es independiente, así cualquier réplica puede atender cualquier
 * solicitud sin afinidad de sesión.
 */
export function createMcpHttpServer(options: McpHttpServerOptions): Server {
  const path = options.path ?? DEFAULT_MCP_PATH;
  const dnsProtection =
    options.allowedHosts === undefined || options.allowedHosts.length === 0
      ? {}
      : { enableDnsRebindingProtection: true, allowedHosts: [...options.allowedHosts] };

  const handleMcp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST") {
      // Sin sesiones no hay flujo SSE que abrir (GET) ni sesión que cerrar (DELETE).
      res.setHeader("Allow", "POST");
      jsonRpcError(res, 405, -32000, "Method not allowed: this server is stateless and accepts POST only");
      return;
    }

    const server = options.createMcpServer();
    // Sin `sessionIdGenerator` el transporte funciona en modo sin sesión.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true, ...dnsProtection });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
  };

  return createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");

    if (pathname === "/healthz") {
      sendJson(res, req.method === "GET" ? 200 : 405, { status: req.method === "GET" ? "ok" : "method_not_allowed" });
      return;
    }
    if (pathname !== path) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }

    handleMcp(req, res).catch((error: unknown) => {
      options.logger.error("mcp_request_failed", { cause: String(error) });
      if (!res.headersSent) {
        jsonRpcError(res, 500, -32603, "Internal server error");
      } else {
        res.end();
      }
    });
  });
}
