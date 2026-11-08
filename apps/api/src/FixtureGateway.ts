import type { ToolGateway, ToolSession } from "@agichat/agent";

/** Datos ficticios únicamente para desbloquear la integración del cliente sin credenciales. */
export class FixtureGateway implements ToolGateway {
  public async open(signal: AbortSignal): Promise<ToolSession> {
    signal.throwIfAborted();
    return {
      tools: [{ name: "recommend_movies", description: "Datos ficticios de integración", inputSchema: { type: "object", additionalProperties: false } }],
      call: async (_call, callSignal) => {
        callSignal.throwIfAborted();
        return { isError: false, data: { candidates: [{ id: 501, title: "Película ficticia de integración", year: 2020, poster: null, imdb_id: null }] } };
      },
      close: async () => undefined
    };
  }
}
