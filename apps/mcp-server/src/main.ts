import { Redis } from "ioredis";

import { createApplication } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { createJsonLogger } from "./logger.js";

// Punto de entrada del servidor MCP. Toda la composición vive en app.ts para
// poder probarla; aquí solo se leen variables y se gestionan las señales.
const logger = createJsonLogger();

try {
  const config = loadConfig(process.env);
  const app = createApplication(config, {
    logger,
    connectRedis: (url) => new Redis(url, { maxRetriesPerRequest: 2 })
  });
  await app.start();

  const shutdown = (signal: string): void => {
    logger.info("shutdown_requested", { signal });
    app.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error("shutdown_failed", { cause: String(error) });
        process.exit(1);
      }
    );
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
} catch (error) {
  logger.error(error instanceof ConfigError ? "invalid_configuration" : "startup_failed", {
    message: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
}
