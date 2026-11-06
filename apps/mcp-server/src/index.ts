// API pública del servidor MCP, para componerlo desde otras aplicaciones o pruebas.
export { createApplication, type Application, type ApplicationDependencies, type RedisConnection } from "./app.js";
export { ConfigError, DEFAULT_HOST, DEFAULT_PORT, loadConfig, type ServerConfig, type SharedStoreKind } from "./config.js";
export { DEFAULT_MCP_PATH, createMcpHttpServer, type McpHttpServerOptions } from "./http.js";
export { createJsonLogger, silentLogger, type Logger } from "./logger.js";
export { SERVER_NAME, SERVER_VERSION, createMcpServer, type ToolDependencies } from "./server.js";
export { MOVIE_TOOL_NAMES, registerMovieTools, type MovieCatalog } from "./tools/movieTools.js";
export { UNTRUSTED_CONTENT_NOTICE } from "./tools/movieSchemas.js";
export { toErrorPayload, type ToolErrorPayload } from "./tools/toolErrors.js";
