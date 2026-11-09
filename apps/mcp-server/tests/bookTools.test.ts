import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BooksError, normalizeBook } from "@agichat/books";
import { TmdbClient } from "@agichat/tmdb";
import { createMcpServer } from "../src/server.js";
import { createApplication } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { BookCatalog } from "../src/tools/bookTools.js";
import { fakeTmdb, json } from "./fixtures.js";

const book = normalizeBook({ id: "dune", volumeInfo: { title: "Dune", authors: ["Frank Herbert"] } });
const books: BookCatalog = {
  getBookDetails: async () => book,
  searchBooks: async () => ({ results: [book], references: [book.reference], total_items: 1, start_index: 0, skipped: 0, ambiguous: false })
};
const logger = { info: () => undefined, error: () => undefined };
const clients: Client[] = [];
afterEach(async () => { await Promise.all(clients.splice(0).map((client) => client.close())); });
async function connect(catalog = books) {
  const movies = new TmdbClient({ accessToken: "test", fetch: fakeTmdb().fetch });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer({ movies, books: catalog, logger }).connect(serverTransport);
  const client = new Client({ name: "books-test", version: "1" });
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}
describe("book MCP integration", () => {
  it("discovers all six tools and validates structured book results", async () => {
    const client = await connect();
    const list = await client.listTools();
    expect(list.tools).toHaveLength(6);
    for (const name of ["search_books", "get_book_details", "compare_movie_book"]) {
      const tool = list.tools.find((item) => item.name === name);
      expect(tool?.annotations?.readOnlyHint).toBe(true);
      expect(tool?.outputSchema).toBeDefined();
    }
    const search = await client.callTool({ name: "search_books", arguments: { query: "Dune" } });
    expect(search.structuredContent).toMatchObject({ results: [book], references: [book.reference] });
    const details = await client.callTool({ name: "get_book_details", arguments: { book_id: "dune" } });
    expect(details.structuredContent).toMatchObject({ book, references: [book.reference] });
    const comparison = await client.callTool({ name: "compare_movie_book", arguments: { movie_id: 501, book_id: "dune" } });
    expect(comparison.structuredContent).toMatchObject({ status: "insufficient_evidence" });
  });
  it("rejects model-supplied evidence, URLs and invalid inputs", async () => {
    const client = await connect();
    for (const args of [{ movie_id: 501, book_id: "dune", evidence: "verified" }, { movie_id: 501, book_id: "https://evil.test" }]) {
      const result = await client.callTool({ name: "compare_movie_book", arguments: args });
      expect(result.isError).toBe(true);
    }
  });
  it("returns safe typed errors and hides unexpected exceptions", async () => {
    const client = await connect({ ...books,
      getBookDetails: async () => { throw new BooksError("timeout", true); },
      searchBooks: async () => { throw new Error("SECRET_API_KEY"); }
    });
    const result = await client.callTool({ name: "get_book_details", arguments: { book_id: "dune" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("timeout");
    const unexpected = await client.callTool({ name: "search_books", arguments: { query: "Dune" } });
    expect(unexpected.isError).toBe(true);
    expect(JSON.stringify(unexpected)).not.toContain("SECRET_API_KEY");
  });
  it("requires a separate quota when books are enabled", () => {
    const env = { TMDB_READ_ACCESS_TOKEN: "test", QUOTA_TMDB: "10/1s", SHARED_STORE: "memory", GOOGLE_BOOKS_ENABLED: "true" };
    expect(() => loadConfig(env)).toThrow("QUOTA_GOOGLE_BOOKS");
    expect(loadConfig({ ...env, QUOTA_GOOGLE_BOOKS: "3/1s" }).quotaPolicies).toHaveProperty("google-books");
    expect(() => loadConfig({ ...env, QUOTA_GOOGLE_BOOKS: "3/1s", GOOGLE_BOOKS_TIMEOUT_MS: "0" })).toThrow("GOOGLE_BOOKS_TIMEOUT_MS");
  });
  it("serves books through the real Streamable HTTP application", async () => {
    const config = loadConfig({ TMDB_READ_ACCESS_TOKEN: "test", QUOTA_TMDB: "10/1s", SHARED_STORE: "memory", GOOGLE_BOOKS_ENABLED: "true", QUOTA_GOOGLE_BOOKS: "5/1s" });
    const tmdb = fakeTmdb({ "/movie/438631": () => json({ id: 438631, title: "Dune", original_title: "Dune", release_date: "2021-10-22", genres: [], external_ids: { imdb_id: "tt1160419" } }) });
    const app = createApplication({ ...config, port: 0 }, { logger, fetch: async (url, init) =>
      new URL(url).hostname === "www.googleapis.com"
        ? json({ id: "dune", volumeInfo: { title: "Dune", authors: ["Frank Herbert"] } })
        : tmdb.fetch(url, init)
    });
    const address = await app.start();
    const client = new Client({ name: "external-books-client", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
      expect((await client.listTools()).tools).toHaveLength(6);
      const result = await client.callTool({ name: "get_book_details", arguments: { book_id: "dune" } });
      expect(result.structuredContent).toMatchObject({ book: { id: "dune" } });
      const comparison = await client.callTool({ name: "compare_movie_book", arguments: { movie_id: 438631, book_id: "dune" } });
      expect(comparison.structuredContent).toMatchObject({ status: "adaptation_identified", references: [book.reference] });
    } finally { await client.close(); await app.stop(); }
  });
});
