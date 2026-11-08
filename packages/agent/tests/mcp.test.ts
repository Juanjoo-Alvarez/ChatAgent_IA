import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { McpGateway, MovieAgent } from "../src/index.js";
import { fixtures, movie, recommendCall, signal } from "./helpers.js";

const servers: Server[] = [];
async function serve(options: { fail?: boolean; structured?: boolean; unknown?: boolean } = {}) {
  const http = createServer((req, res) => {
    const mcp = new McpServer({ name: "local-fixture", version: "1" });
    mcp.registerTool("recommend_movies", { inputSchema: { page: z.number().int().positive().optional() }, ...(options.structured === false ? {} : { outputSchema: { candidates: z.array(z.any()) } }), annotations: { readOnlyHint: true } }, async () => {
      if (options.fail) { return { isError: true, content: [{ type: "text", text: "secret-provider-token" }] }; }
      return { content: [{ type: "text", text: "Resultados" }], ...(options.structured === false ? {} : { structuredContent: { candidates: [movie] } }) };
    });
    if (options.unknown) {
      mcp.registerTool("run_shell", { inputSchema: {}, annotations: { readOnlyHint: true } }, async () => ({ content: [] }));
      mcp.registerTool("search_books", { inputSchema: {} }, async () => ({ content: [] }));
    }
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    res.on("close", () => { void mcp.close(); void transport.close(); });
    void mcp.connect(transport).then(() => transport.handleRequest(req, res)).catch(() => res.end());
  });
  servers.push(http);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); })));
});
describe("actual MCP client transport against a local server", () => {
  it("discovers only approved read-only tools and validates arguments before calling", async () => {
    const session = await new McpGateway(await serve({ unknown: true })).open(signal());
    try {
      expect(session.tools.map((tool) => tool.name)).toEqual(["recommend_movies"]);
      expect((await session.call({ name: "recommend_movies", arguments: {} }, signal())).data).toMatchObject({ candidates: [movie] });
      await expect(session.call({ name: "run_shell", arguments: {} }, signal())).rejects.toMatchObject({ code: "policy_denied" });
      await expect(session.call({ name: "recommend_movies", arguments: { page: -1 } }, signal())).rejects.toMatchObject({ code: "policy_denied" });
    } finally { await session.close(); }
  });
  it("runs a complete agent turn through Streamable HTTP", async () => {
    const f = fixtures([recommendCall, { content: "Te recomiendo Marea alta.", toolCalls: [] }]);
    const result = await new MovieAgent(f.model, new McpGateway(await serve())).respond({ content: "Drama", history: [], signal: signal() });
    expect(result.movies[0]?.id).toBe(501);
  });
  it("redacts tool failure details", async () => {
    const session = await new McpGateway(await serve({ fail: true })).open(signal());
    try { expect(await session.call({ name: "recommend_movies", arguments: {} }, signal())).toEqual({ isError: true, data: { error: "tool_unavailable" } }); }
    finally { await session.close(); }
  });
  it("fails closed when structured output is missing", async () => {
    const session = await new McpGateway(await serve({ structured: false })).open(signal());
    try { await expect(session.call({ name: "recommend_movies", arguments: {} }, signal())).rejects.toBeDefined(); }
    finally { await session.close(); }
  });
  it("handles connection failures and pre-cancelled requests", async () => {
    await expect(new McpGateway("http://127.0.0.1:1/mcp", 100).open(signal())).rejects.toMatchObject({ code: "unavailable" });
    const controller = new AbortController(); controller.abort();
    await expect(new McpGateway(await serve()).open(controller.signal)).rejects.toBeDefined();
  });
});
