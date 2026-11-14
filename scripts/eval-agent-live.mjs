import console from "node:console";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

import { evaluateAgent, McpGateway, MovieAgent, OllamaModel } from "../packages/agent/dist/index.js";

const cases = JSON.parse(await readFile(new URL("../evals/agent-cases.json", import.meta.url), "utf8"));
if (process.argv.includes("--list")) {
  console.info(JSON.stringify(cases.map(({ id, category }) => ({ id, category })), null, 2));
} else if (process.env.RUN_LIVE_EVALS !== "1") {
  console.error("Define RUN_LIVE_EVALS=1 para ejecutar llamadas reales a Ollama y MCP. --list no llama servicios.");
  process.exitCode = 2;
} else {
  const model = process.env.OLLAMA_MODEL ?? "qwen3:4b-instruct-2507-q4_K_M";
  const agent = new MovieAgent(new OllamaModel({ url: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434", model }), new McpGateway(process.env.MCP_URL ?? "http://127.0.0.1:8001/mcp"));
  const results = await evaluateAgent(agent, cases);
  const report = { generatedAt: new Date().toISOString(), model, promptVersion: "v1", owaspVersion: "2025", requiresHumanReview: true, mechanicalChecksPassed: results.filter((result) => result.passedChecks).length, total: results.length, results };
  const directory = new URL("../evals/results/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const destination = new URL(`live-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, directory);
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.info(JSON.stringify({ report: destination.pathname, passedChecks: report.mechanicalChecksPassed, total: report.total, requiresHumanReview: true }));
  if (results.some((result) => !result.passedChecks)) { process.exitCode = 1; }
}
