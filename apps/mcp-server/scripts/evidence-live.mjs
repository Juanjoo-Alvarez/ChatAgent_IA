// Evidencia de consultas reales a TMDB a través del servidor MCP en ejecución.
// No lee ni registra el token: solo habla con el servidor por Streamable HTTP.
import console from "node:console";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const CASES = [
  { id: "search-exact", tool: "search_movies", arguments: { query: "Inception", year: 2010 } },
  { id: "search-ambiguous", tool: "search_movies", arguments: { query: "La casa" } },
  { id: "details-imdb", tool: "get_movie_details", arguments: { movie_id: 27205 } },
  { id: "candidates", tool: "recommend_movies", arguments: { genres: ["Ciencia ficción"], year_from: 2010, min_rating: 7 } },
  { id: "no-results", tool: "search_movies", arguments: { query: "qzxwvy sin coincidencias 9137" } }
];

function summarizeMovie(movie) {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    imdb_id: movie.imdb_id,
    reference: movie.reference?.kind ?? null,
    has_poster: movie.poster !== null,
    suspected_instruction_fields: movie.provenance?.suspected_instruction_fields ?? []
  };
}

function summarize(data) {
  if (data === undefined || data === null) {
    return null;
  }
  if (data.movie !== undefined) {
    return { movie: summarizeMovie(data.movie), missing_fields: data.missing_fields };
  }
  const list = data.results ?? data.candidates ?? [];
  return {
    total_results: data.total_results ?? null,
    returned: list.length,
    ambiguous: data.ambiguous,
    exact_title_match_ids: data.exact_title_match_ids,
    strategy: data.strategy,
    first: list.slice(0, 3).map(summarizeMovie)
  };
}

function errorCode(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  try {
    return JSON.parse(text ?? "{}").error?.code ?? "unknown";
  } catch {
    return "unknown";
  }
}

if (process.env.RUN_LIVE_TMDB !== "1") {
  console.error("Define RUN_LIVE_TMDB=1 para consultar TMDB real mediante el servidor MCP. Cada caso consume cuota.");
  process.exitCode = 2;
} else {
  const mcpUrl = process.env.MCP_URL ?? "http://127.0.0.1:8001/mcp";
  const client = new Client({ name: "agichat-tmdb-evidence", version: "0.2.1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
  const results = [];
  try {
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    for (const testCase of CASES) {
      const startedAt = new Date();
      const result = await client.callTool({ name: testCase.tool, arguments: testCase.arguments });
      results.push({
        id: testCase.id,
        tool: testCase.tool,
        arguments: testCase.arguments,
        started_at: startedAt.toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
        ok: result.isError !== true,
        error_code: result.isError === true ? errorCode(result) : null,
        summary: result.isError === true ? null : summarize(result.structuredContent)
      });
    }
    const report = {
      generated_at: new Date().toISOString(),
      source: "TMDB API real vía servidor MCP (Streamable HTTP)",
      mcp_url: mcpUrl,
      server: client.getServerVersion() ?? null,
      tools,
      external_requests_note: "Cada caso puede generar varias solicitudes a TMDB (detalles, external_ids, géneros); la caché reduce las repeticiones.",
      passed: results.filter((item) => item.ok).length,
      total: results.length,
      results
    };
    const directory = new URL("../../../evals/results/", import.meta.url);
    await mkdir(directory, { recursive: true });
    const destination = new URL(`tmdb-live-${report.generated_at.replace(/[:.]/g, "-")}.json`, directory);
    await writeFile(destination, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.info(JSON.stringify({ report: fileURLToPath(destination), passed: report.passed, total: report.total }));
    if (report.passed !== report.total) {
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}
