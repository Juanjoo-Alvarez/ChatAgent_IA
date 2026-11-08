import { FixtureModel, McpGateway, MovieAgent, OllamaModel } from "@agichat/agent";
import { Redis } from "ioredis";

import type { ApiConfig } from "./config.js";
import { FixtureGateway } from "./FixtureGateway.js";
import { RedisSessionStore } from "./RedisSessionStore.js";
import { createChatServer } from "./server.js";
import { InMemorySessionStore } from "./sessions.js";

export function createApi(config: ApiConfig) {
  const redis = config.sessionStore === "redis" ? new Redis(config.redisUrl as string, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false }) : null;
  // No imprimir excepciones Redis: pueden contener datos de conexión.
  redis?.on("error", () => undefined);
  const store = redis === null ? new InMemorySessionStore() : new RedisSessionStore(redis);
  const model = config.mode === "fixture" ? new FixtureModel() : new OllamaModel({ url: config.ollamaUrl, model: config.ollamaModel });
  const gateway = config.toolsMode === "fixture" ? new FixtureGateway() : new McpGateway(config.mcpUrl);
  const server = createChatServer(config, new MovieAgent(model, gateway), store);
  return {
    start: async () => {
      try {
        if (redis !== null) { await redis.connect(); await redis.ping(); }
        return await server.start();
      }
      catch (error) { redis?.disconnect(); throw error; }
    },
    stop: async () => { try { await server.stop(); } finally { redis?.disconnect(); } }
  };
}
