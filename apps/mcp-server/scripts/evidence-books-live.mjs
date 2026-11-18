// Validación real y acotada del entregable de libros. No usa fixtures.
import console from "node:console";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { BooksError, GoogleBooksClient, bookIdSchema, compareMovieBook } from "@agichat/books";
import { InMemoryCacheStore, InMemoryQuotaStore, QuotaManager, createResilientFetch } from "@agichat/external-api";
import { TmdbClient, TmdbError } from "@agichat/tmdb";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpServer } from "../dist/server.js";
import { createMcpHttpServer } from "../dist/http.js";

if (process.env.RUN_LIVE_BOOKS !== "1") {
  console.error("Define RUN_LIVE_BOOKS=1. Realiza consultas a Google Books y, si hay token, a TMDB; consume cuota real.");
  process.exitCode = 2;
} else {
  const started = new Date();
  const requests = [];
  const checks = [];
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  const volumeId = bookIdSchema.parse(process.env.BOOKS_EVIDENCE_VOLUME_ID ?? "q_5WzQEACAAJ");
  // Presupuesto del diagnóstico aislado; no modifica los contadores del servicio.
  const quota = new QuotaManager({ store: new InMemoryQuotaStore(), policies: {
    "google-books": { windows: [{ limit: 3, windowMs: 60000 }] },
    tmdb: { windows: [{ limit: 6, windowMs: 60000 }] }
  } });
  const cache = new InMemoryCacheStore();
  const observedFetch = async (input, init) => {
    const provider = new URL(input).hostname === "www.googleapis.com" ? "google-books" : "tmdb";
    const begin = Date.now();
    try {
      const response = await globalThis.fetch(input, init);
      requests.push({ provider, status: response.status, duration_ms: Date.now() - begin });
      return response;
    } catch {
      requests.push({ provider, status: null, duration_ms: Date.now() - begin });
      // No conservar la excepción original: podría contener la URL con la clave.
      throw new Error("external_request_failed");
    }
  };
  const books = new GoogleBooksClient({ quota, cache, apiKey: key, fetch: observedFetch,
    timeoutMs: 10000, retry: { maxAttempts: 1 } });
  const check = async (name, operation) => {
    const begin = Date.now();
    try {
      const value = await operation();
      checks.push({ name, status: "passed", duration_ms: Date.now() - begin });
      return value;
    } catch (error) {
      checks.push({ name, status: "failed", duration_ms: Date.now() - begin,
        code: error instanceof BooksError || error instanceof TmdbError ? error.code : "validation_failed" });
      return null;
    }
  };
  const search = await check("google_books_search", () => books.searchBooks({ query: "intitle:Dune inauthor:Frank Herbert", max_results: 5 }));
  const book = await check("google_books_details", () => books.getBookDetails(volumeId));
  let movie = null;
  let tmdb = null;
  if (token) {
    tmdb = new TmdbClient({ accessToken: token, timeoutMs: 10000, cache: { store: cache },
      fetch: createResilientFetch({ provider: "tmdb", quota, fetch: observedFetch, retry: { maxAttempts: 1 } }) });
    movie = await check("tmdb_dune_2021", () => tmdb.getMovieDetails(438631));
  } else {
    checks.push({ name: "tmdb_dune_2021", status: "blocked", code: "missing_tmdb_read_access_token" });
  }
  let comparison = null;
  if (book && movie) {
    comparison = await check("real_comparison", async () => {
      const result = compareMovieBook(movie, book, { genres: [], requires_fidelity: false });
      if (result.status !== "adaptation_identified" || result.similarities.length === 0 || result.differences.length === 0
        || result.references[0]?.id !== book.id || result.sources.length < 3) {
        throw new Error("comparison_not_grounded");
      }
      return result;
    });
  } else {
    checks.push({ name: "real_comparison", status: "blocked", code: "real_provider_data_unavailable" });
  }
  if (book) {
    await check("cached_book_details", async () => {
      const count = requests.length;
      await books.getBookDetails(volumeId);
      if (requests.length !== count) { throw new Error("cache_miss"); }
    });
  }
  if (comparison && tmdb) {
    await check("independent_mcp_client", async () => {
      const logger = { info() {}, error() {} };
      const server = createMcpHttpServer({ logger,
        createMcpServer: () => createMcpServer({ movies: tmdb, books, logger }) });
      const client = new Client({ name: "books-live-evidence", version: "1" });
      try {
        await new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", resolve);
        });
        await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`)));
        const { tools } = await client.listTools();
        for (const name of ["search_books", "get_book_details", "compare_movie_book"]) {
          if (!tools.some((tool) => tool.name === name && tool.outputSchema)) {
            throw new Error("missing_mcp_tool");
          }
        }
        const queries = [
          { name: "search_books", arguments: { query: "intitle:Dune inauthor:Frank Herbert", max_results: 5 } },
          { name: "get_book_details", arguments: { book_id: volumeId } },
          { name: "compare_movie_book", arguments: { movie_id: 438631, book_id: volumeId } }
        ];
        const count = requests.length;
        for (const query of queries) {
          const result = await client.callTool(query);
          if (result.isError || !result.structuredContent) { throw new Error("mcp_call_failed"); }
          if (query.name === "compare_movie_book" && result.structuredContent.status !== "adaptation_identified") {
            throw new Error("mcp_comparison_failed");
          }
        }
        if (requests.length !== count) { throw new Error("mcp_cache_miss"); }
      } finally {
        try { await client.close(); } finally {
          await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
        }
      }
    });
  } else {
    checks.push({ name: "independent_mcp_client", status: "blocked", code: "real_provider_data_unavailable" });
  }
  const complete = comparison !== null && checks.every((item) => item.status === "passed");
  const report = {
    generated_at: started.toISOString(), complete,
    scope: "Daniel: Google Books y comparación real Dune (2021) / Frank Herbert",
    method: "Clientes de producción con HTTP real; sin fixtures ni LLM. No acredita el recorrido del agente o del widget.",
    credentials_configured: { google_books: Boolean(key), tmdb: Boolean(token) },
    checks, requests,
    search_candidates: search?.results.map(({ id, title, authors }) => ({ id, title, authors })) ?? [],
    book: book ? { id: book.id, title: book.title, authors: book.authors, published_date: book.published_date,
      reference: book.reference, url: book.url, has_description: book.description !== null } : null,
    movie: movie ? { id: movie.id, title: movie.title, year: movie.year, reference: movie.reference } : null,
    comparison: comparison ? { status: comparison.status, reasons: comparison.reasons,
      similarities: comparison.similarities, differences: comparison.differences,
      recommendation: comparison.recommendation, limitations: comparison.limitations,
      sources: comparison.sources, references: comparison.references } : null,
    review_required: "Revisar las fuentes y el contenido antes de declarar terminada la entrega. Un reporte bloqueado no acredita la comparación."
  };
  const directory = new URL("../../../evals/results/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const destination = new URL(`books-live-${started.toISOString().replace(/[:.]/g, "-")}.json`, directory);
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.info(JSON.stringify({ report: fileURLToPath(destination), complete, checks }, null, 2));
  if (!complete) { process.exitCode = 1; }
}
