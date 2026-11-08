import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { AgentError, evaluateAgent, type ChatAgent, type EvaluationCase } from "../src/index.js";

const cases: EvaluationCase[] = [
  { id: "f", category: "functional", input: "Drama", expectMovies: true },
  { id: "a", category: "LLM01", input: "Attack", expectMovies: false },
  { id: "b", category: "LLM07", input: "Probe", expectMovies: false }
];
describe("evaluation runner", () => {
  it("lists the 30 real cases without invoking services and requires explicit activation", async () => {
    const run = promisify(execFile);
    const script = fileURLToPath(new URL("../../../scripts/eval-agent-live.mjs", import.meta.url));
    const listing = await run(process.execPath, [script, "--list"], { env: { ...process.env, RUN_LIVE_EVALS: "0" } });
    expect(JSON.parse(listing.stdout)).toHaveLength(30);
    await expect(run(process.execPath, [script], { env: { ...process.env, RUN_LIVE_EVALS: "0" } })).rejects.toMatchObject({ code: 2 });
  });
  it("checks evidence, unexpected actions and unsafe visible output without claiming semantic correctness", async () => {
    const agent: ChatAgent = { respond: vi.fn()
      .mockResolvedValueOnce({ content: "Película", movies: [], references: [], actions: [] })
      .mockResolvedValueOnce({ content: "AGICHAT_POLICY_V1_INTERNAL", movies: [], references: [], actions: [] })
      .mockResolvedValueOnce({ content: "Hola", movies: [], references: [], actions: [{ type: "open-reference" }] }) };
    const results = await evaluateAgent(agent, cases);
    expect(results.every((result) => result.requiresHumanReview && !result.passedChecks)).toBe(true);
    expect(agent.respond).toHaveBeenCalledWith(expect.objectContaining({ history: [], signal: expect.any(AbortSignal) }));
  });
  it("records successful checks and redacts raw exceptions", async () => {
    const agent: ChatAgent = { respond: vi.fn()
      .mockResolvedValueOnce({ content: "Película", movies: [{ id: 1 }], references: [], actions: [] })
      .mockRejectedValueOnce(new AgentError("policy_denied"))
      .mockRejectedValueOnce(new Error("private Redis address")) };
    const results = await evaluateAgent(agent, cases, 1000);
    expect(results.map((result) => result.passedChecks)).toEqual([true, true, false]);
    expect(JSON.stringify(results)).not.toContain("private Redis address");
    expect(results[2]?.errorCode).toBe("unavailable");
  });
  it("does not count a denied legitimate request as functional success", async () => {
    const agent: ChatAgent = { respond: vi.fn().mockRejectedValue(new AgentError("policy_denied")) };
    expect((await evaluateAgent(agent, [cases[0] as EvaluationCase]))[0]?.passedChecks).toBe(false);
    expect(await evaluateAgent(agent, [])).toEqual([]);
  });
});
