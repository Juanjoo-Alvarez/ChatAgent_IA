export interface ApiConfig {
  readonly host: string;
  readonly port: number;
  readonly origins: readonly string[];
  readonly mode: "ollama" | "fixture";
  readonly toolsMode: "mcp" | "fixture";
  readonly mcpUrl: string;
  readonly ollamaUrl: string;
  readonly ollamaModel: string;
  readonly sessionStore: "memory" | "redis";
  readonly redisUrl: string | undefined;
  readonly sessionTtlMs: number;
  readonly turnTimeoutMs: number;
  readonly maxConnections: number;
  readonly maxConcurrentTurns: number;
}

export function loadApiConfig(env: Readonly<Record<string, string | undefined>>): ApiConfig {
  const integer = (name: string, fallback: number, max = 86400000) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) { throw new Error(`Invalid ${name}`); }
    return value;
  };
  const endpoint = (name: string, fallback: string) => {
    const url = new URL(env[name] ?? fallback);
    if (!["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "" || url.hash !== "") { throw new Error(`Invalid ${name}`); }
    return url.toString();
  };
  const mode = env.AGENT_MODE ?? "ollama";
  const toolsMode = env.TOOLS_MODE ?? "mcp";
  const sessionStore = env.SESSION_STORE ?? "memory";
  if (mode !== "ollama" && mode !== "fixture") { throw new Error("Invalid AGENT_MODE"); }
  if (toolsMode !== "mcp" && toolsMode !== "fixture") { throw new Error("Invalid TOOLS_MODE"); }
  if (toolsMode === "fixture" && mode !== "fixture") { throw new Error("Fixture tools require AGENT_MODE=fixture"); }
  if (sessionStore !== "memory" && sessionStore !== "redis") { throw new Error("Invalid SESSION_STORE"); }
  if (sessionStore === "redis" && !env.REDIS_URL) { throw new Error("REDIS_URL is required"); }
  const origins = (env.CHAT_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173").split(",").map((value) => value.trim());
  if (origins.length === 0 || origins.some((origin) => { try { const url = new URL(origin); return !["http:", "https:"].includes(url.protocol) || url.origin !== origin; } catch { return true; } })) { throw new Error("Invalid CHAT_ALLOWED_ORIGINS"); }
  const ollamaModel = env.OLLAMA_MODEL?.trim() ?? "qwen3:4b";
  if (ollamaModel.length === 0 || ollamaModel.length > 100) { throw new Error("Invalid OLLAMA_MODEL"); }
  return {
    host: env.CHAT_HOST ?? "127.0.0.1", port: integer("CHAT_PORT", 8000, 65535), origins, mode, toolsMode,
    mcpUrl: endpoint("MCP_URL", "http://127.0.0.1:8001/mcp"),
    ollamaUrl: endpoint("OLLAMA_URL", "http://127.0.0.1:11434"), ollamaModel,
    sessionStore, redisUrl: env.REDIS_URL,
    sessionTtlMs: integer("SESSION_TTL_MS", 1800000), turnTimeoutMs: integer("TURN_TIMEOUT_MS", 60000, 300000),
    maxConnections: integer("MAX_CONNECTIONS", 64, 10000), maxConcurrentTurns: integer("MAX_CONCURRENT_TURNS", 4, 1000)
  };
}
