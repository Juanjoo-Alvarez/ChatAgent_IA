import type { AddressInfo } from "node:net";

import {
  InMemoryCacheStore,
  InMemoryQuotaStore,
  QuotaManager,
  RedisCacheStore,
  RedisQuotaStore,
  createResilientFetch,
  type CacheStore,
  type FetchLike,
  type QuotaStore,
  type RedisLike
} from "@agichat/external-api";
import { TMDB_QUOTA_PROVIDER, TmdbClient } from "@agichat/tmdb";

import type { ServerConfig } from "./config.js";
import { createMcpHttpServer } from "./http.js";
import type { Logger } from "./logger.js";
import { createMcpServer } from "./server.js";

/** Conexión Redis que la aplicación abre y debe cerrar al detenerse. */
export interface RedisConnection extends RedisLike {
  quit(): Promise<unknown>;
}

export interface ApplicationDependencies {
  readonly logger: Logger;
  /** Transporte HTTP hacia TMDB; en pruebas se reemplaza por respuestas controladas. */
  readonly fetch?: FetchLike | undefined;
  readonly connectRedis?: ((url: string) => RedisConnection) | undefined;
  /**
   * Almacenamientos ya creados. Tienen prioridad sobre `sharedStore`; permiten
   * que varias instancias compartan contadores y caché, como réplicas.
   */
  readonly stores?: { readonly quota: QuotaStore; readonly cache: CacheStore } | undefined;
  /** Opciones del cliente TMDB que no provienen del entorno (por ejemplo, reintentos en pruebas). */
  readonly retry?: { readonly sleep?: (ms: number, signal: AbortSignal | undefined) => Promise<void> } | undefined;
}

export interface Application {
  readonly quota: QuotaManager;
  start(): Promise<AddressInfo>;
  stop(): Promise<void>;
}

/** Compone cuotas, caché, cliente TMDB y servidor MCP según la configuración. */
export function createApplication(config: ServerConfig, dependencies: ApplicationDependencies): Application {
  const { logger } = dependencies;

  let redis: RedisConnection | null = null;
  let quotaStore: QuotaStore;
  let cacheStore: CacheStore;

  if (dependencies.stores !== undefined) {
    quotaStore = dependencies.stores.quota;
    cacheStore = dependencies.stores.cache;
  } else if (config.sharedStore === "redis") {
    if (config.redisUrl === null || dependencies.connectRedis === undefined) {
      throw new Error("A Redis connection is required when SHARED_STORE=redis");
    }
    redis = dependencies.connectRedis(config.redisUrl);
    quotaStore = new RedisQuotaStore(redis);
    cacheStore = new RedisCacheStore(redis);
  } else {
    logger.info("shared_store_in_memory", { warning: "Quotas and cache are not shared between replicas" });
    quotaStore = new InMemoryQuotaStore();
    cacheStore = new InMemoryCacheStore();
  }

  const quota = new QuotaManager({
    store: quotaStore,
    policies: config.quotaPolicies,
    onEvent: (event) => {
      if (event.type === "rejected") {
        logger.info("quota_rejected", { provider: event.provider, retry_after_ms: event.retryAfterMs });
      } else if (event.type === "store_error") {
        logger.error("quota_store_error", { provider: event.provider, cause: String(event.error) });
      }
    }
  });

  const tmdb = new TmdbClient({
    accessToken: config.tmdb.accessToken,
    language: config.tmdb.language,
    timeoutMs: config.tmdb.timeoutMs,
    fetch: createResilientFetch({
      provider: TMDB_QUOTA_PROVIDER,
      quota,
      fetch: dependencies.fetch,
      retry: {
        ...(dependencies.retry?.sleep === undefined ? {} : { sleep: dependencies.retry.sleep }),
        onRetry: (event) => logger.info("tmdb_retry", { ...event })
      }
    }),
    cache: {
      store: cacheStore,
      onStoreError: (error, operation) => logger.error("cache_store_error", { operation, cause: String(error) })
    }
  });

  const httpServer = createMcpHttpServer({
    path: config.path,
    allowedHosts: config.allowedHosts,
    logger,
    createMcpServer: () => createMcpServer({ movies: tmdb, logger })
  });

  return {
    quota,
    start: () =>
      new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(config.port, config.host, () => {
          httpServer.off("error", reject);
          const address = httpServer.address() as AddressInfo;
          logger.info("mcp_server_listening", {
            url: `http://${config.host}:${address.port}${config.path}`,
            transport: "streamable-http",
            shared_store: config.sharedStore
          });
          resolve(address);
        });
      }),
    stop: async () => {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
        httpServer.closeAllConnections();
      });
      await redis?.quit();
      logger.info("mcp_server_stopped");
    }
  };
}
