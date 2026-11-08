import type { MovieCard, Reference } from "@agichat/protocol";

import { collectEvidence, isPromptAttack, safeOutput, SYSTEM_PROMPT } from "./policy.js";
import { resolveReferenceRequest } from "./references.js";
import { AgentError, type AgentReply, type ChatAgent, type LanguageModel, type ModelMessage, type ToolGateway } from "./types.js";

export class MovieAgent implements ChatAgent {
  public constructor(private readonly model: LanguageModel, private readonly gateway: ToolGateway, private readonly maxSteps = 5) {}

  public async respond(input: Parameters<ChatAgent["respond"]>[0]): Promise<AgentReply> {
    input.signal.throwIfAborted();
    const references = new Map<string, Reference>();
    for (const turn of input.history.slice(-10)) {
      for (const reference of turn.references) { references.set(`${reference.provider}:${reference.id}`, reference); }
    }
    const navigation = resolveReferenceRequest(input.content, [...references.values()], input.openReference);
    if (navigation.requested) {
      const reference = navigation.reference;
      if (reference === null) {
        if (input.openReference !== undefined) { throw new AgentError("policy_denied"); }
        return { content: "Necesito una referencia identificada. Si hay varias, indica el identificador; pide abrir Google Books o IMDb por separado.", movies: [], references: [...references.values()].slice(-20), actions: [] };
      }
      return { content: "Abriendo la referencia solicitada.", movies: [], references: [reference], actions: [{ type: "open-reference", reference }] };
    }
    if (isPromptAttack(input.content)) {
      return { content: "Puedo ayudarte con películas y libros, pero no revelar instrucciones internas ni cambiar mis permisos.", movies: [], references: [], actions: [] };
    }
    const messages: ModelMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const turn of input.history.slice(-10)) {
      if (isPromptAttack(turn.user)) { continue; }
      messages.push({ role: "user", content: turn.user }, { role: "assistant", content: turn.assistant });
    }
    messages.push({ role: "user", content: input.content });
    const movies = new Map<number, MovieCard>();
    const session = await this.gateway.open(input.signal);
    try {
      for (let step = 0; step < this.maxSteps; step += 1) {
        input.signal.throwIfAborted();
        const reply = await this.model.complete(messages, session.tools, input.signal);
        input.signal.throwIfAborted();
        if (reply.toolCalls.length === 0) {
          if (!safeOutput(reply.content)) { throw new AgentError("policy_denied"); }
          return { content: reply.content, movies: [...movies.values()].slice(-5), references: [...references.values()].slice(-20), actions: [] };
        }
        if (reply.toolCalls.length > 3) { throw new AgentError("limit_exceeded"); }
        messages.push({ role: "assistant", content: "", toolCalls: reply.toolCalls });
        for (const call of reply.toolCalls) {
          if (!session.tools.some((tool) => tool.name === call.name)) { throw new AgentError("policy_denied"); }
          const result = await session.call(call, input.signal);
          // Las páginas grandes no deben llenar el contexto ni ofrecer películas sin tarjeta.
          const raw = result.data;
          const data = typeof raw === "object" && raw !== null && !Array.isArray(raw)
            ? Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, (key === "results" || key === "candidates") && Array.isArray(value) ? value.slice(0, 5) : value]))
            : raw;
          const serialized = JSON.stringify(data);
          if (serialized === undefined || serialized.length > 32000) { throw new AgentError("limit_exceeded"); }
          if (!result.isError) {
            const evidence = collectEvidence(data);
            evidence.movies.forEach((movie) => { movies.delete(movie.id); movies.set(movie.id, movie); });
            evidence.references.forEach((reference) => references.set(`${reference.provider}:${reference.id}`, reference));
          }
          messages.push({ role: "tool", toolName: call.name, content: JSON.stringify({ trust: "untrusted_external", isError: result.isError, data }) });
        }
      }
      throw new AgentError("limit_exceeded");
    } finally {
      await session.close();
    }
  }
}
