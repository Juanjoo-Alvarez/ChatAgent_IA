import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { performance } from "node:perf_hooks";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Redis } from "ioredis";
import { createApplication } from "../dist/app.js";
import { loadConfig } from "../dist/config.js";
import { GroqModel, McpGateway, MovieAgent } from "../../../packages/agent/dist/index.js";

const checks = ["preferencias y acción", "continuidad y alternativas", "adaptación recomendada", "comparaciones de otras obras", "sin evidencia", "planificación con Groq"];
if (process.argv.includes("--list")) {
  console.info(JSON.stringify(checks));
} else if (process.env.RUN_LIVE_EVALS !== "1") {
  console.error("Define RUN_LIVE_EVALS=1 para usar proveedores reales y sus cuotas. --list no consulta servicios.");
  process.exitCode = 2;
} else {
  const api = parseEnv(await readFile(new URL("../../api/.env", import.meta.url), "utf8"));
  const model = new GroqModel({ apiKey: process.env.GROQ_API_KEY ?? api.GROQ_API_KEY ?? "", model: process.env.GROQ_MODEL ?? api.GROQ_MODEL ?? "openai/gpt-oss-120b" });
  const config = loadConfig(process.env);
  const app = createApplication({ ...config, port: 0, host: "127.0.0.1", allowedHosts: [] }, {
    logger: { info() {}, error() {} }, connectRedis: (url) => new Redis(url, { maxRetriesPerRequest: 1 })
  });
  const report = { generatedAt: new Date().toISOString(), requiresHumanReview: true, results: [] };
  try {
    const address = await app.start();
    const gateway = new McpGateway(`http://127.0.0.1:${address.port}${config.path}`, 25000);
    let diagnostics;
    const agent = new MovieAgent(model, gateway, undefined, (event) => { diagnostics = event; });
    async function turn(content, history = [], check = () => true) {
      const started = performance.now();
      try {
        const reply = await agent.respond({ content, history, signal: globalThis.AbortSignal.timeout(60000) });
        const result = { input: content, passed: check(reply), durationMs: Math.round(performance.now() - started),
          response: reply.content, movies: reply.movies, references: reply.references, comparison: reply.context?.comparisonStatus, diagnostics };
        report.results.push(result);
        console.info(JSON.stringify(result));
        history.push({ user: content, assistant: reply.content, references: reply.references, context: reply.context });
        return reply;
      } catch (error) {
        const result = { input: content, passed: false, error: error.code ?? "unavailable", source: error.source, diagnostics };
        report.results.push(result);
        console.info(JSON.stringify(result));
        return undefined;
      }
    }
    if (!process.argv.includes("--planner-only")) {
    const history = [];
    await turn("Recomiéndame una película. Me gustaría que primero me preguntaras por mis gustos.", history, (reply) => reply.context?.awaitingPreferences === true);
    const first = await turn("Acción", history, (reply) => reply.movies.length === 1 && reply.context?.recommendation?.criteria.genres?.includes(28));
    await turn("Dame otra", history, (reply) => reply.movies.length === 1 && reply.movies[0].id !== first?.movies[0]?.id);
    await turn("¿Está inspirada en algún libro?", history, (reply) => reply.context?.comparisonStatus !== undefined);
    await turn("Recomiéndame una película basada en un libro que también valga la pena leer.", [], (reply) => reply.context?.comparisonStatus === "adaptation_identified");
    // IDs de prueba elegidos por el runner; ninguna respuesta del modelo aporta asociaciones.
    for (const [id, title] of [[120, "La comunidad del anillo"], [278, "Sueño de fuga"], [27205, "El Origen"]]) {
      const previous = [{ user: "Detalles", assistant: "Película seleccionada", references: [], context: { movies: [{ id, title, year: null, poster: null, imdbId: null }], books: [] } }];
      await turn("¿Está basada en un libro?", previous, (reply) => reply.context?.comparisonStatus === (id === 27205 ? "insufficient_evidence" : "adaptation_identified"));
    }
    }
    await turn("Recomiéndame un thriller de los años noventa con valoración mínima de 7 y al menos 100 votos.", [], (reply) => {
      const criteria = reply.context?.recommendation?.criteria;
      const year = reply.movies[0]?.year;
      return year >= 1990 && year <= 1999 && criteria?.min_rating >= 7 && criteria?.min_vote_count >= 100;
    });
  } finally {
    await app.stop();
    const directory = new URL("../../../evals/results/", import.meta.url);
    await mkdir(directory, { recursive: true });
    const path = new URL(`conversations-${Date.now()}.json`, directory);
    await writeFile(path, JSON.stringify(report, null, 2) + "\n", "utf8");
    if (report.results.some((result) => !result.passed)) { process.exitCode = 1; }
    console.info(JSON.stringify({ report: path.pathname, passed: report.results.filter((result) => result.passed).length, total: report.results.length, requiresHumanReview: true }));
  }
}
