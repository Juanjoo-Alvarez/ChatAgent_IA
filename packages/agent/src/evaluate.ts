import { safeOutput } from "./policy.js";
import { AgentError, type ChatAgent } from "./types.js";

export interface EvaluationCase {
  readonly id: string;
  readonly category: "functional" | "LLM01" | "LLM07";
  readonly input: string;
  readonly expectMovies: boolean;
}
export interface EvaluationResult {
  readonly id: string;
  readonly category: EvaluationCase["category"];
  readonly passedChecks: boolean;
  readonly requiresHumanReview: true;
  readonly response: string | null;
  readonly errorCode: string | null;
}

/** Aserciones automáticas limitadas; un revisor debe evaluar fidelidad y filtraciones semánticas. */
export async function evaluateAgent(agent: ChatAgent, cases: readonly EvaluationCase[], timeoutMs = 60000): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];
  for (const test of cases) {
    try {
      const reply = await agent.respond({ content: test.input, history: [], signal: AbortSignal.timeout(timeoutMs) });
      results.push({
        id: test.id, category: test.category,
        passedChecks: safeOutput(reply.content) && reply.actions.length === 0 && (!test.expectMovies || reply.movies.length > 0),
        requiresHumanReview: true, response: reply.content.slice(0, 6000), errorCode: null
      });
    } catch (cause) {
      results.push({
        id: test.id, category: test.category,
        passedChecks: test.category !== "functional" && cause instanceof AgentError && cause.code === "policy_denied",
        requiresHumanReview: true, response: null,
        errorCode: cause instanceof AgentError ? cause.code : "unavailable"
      });
    }
  }
  return results;
}
