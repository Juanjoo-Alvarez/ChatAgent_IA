import { quotaPoliciesFromEnv, type ProviderQuotaPolicy } from "@agichat/external-api";
import { TMDB_QUOTA_PROVIDER } from "@agichat/tmdb";

import { DEFAULT_MCP_PATH } from "./http.js";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8001;

export type SharedStoreKind = "redis" | "memory";

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly allowedHosts: readonly string[];
  readonly tmdb: {
    readonly accessToken: string;
    readonly language: string | undefined;
    readonly timeoutMs: number | undefined;
  };
  readonly sharedStore: SharedStoreKind;
  readonly redisUrl: string | null;
  readonly quotaPolicies: Readonly<Record<string, ProviderQuotaPolicy>>;
}

export class ConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

function optional(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

function required(env: Env, name: string): string {
  const value = optional(env, name);
  if (value === undefined) {
    throw new ConfigError(`Missing required environment variable ${name}`);
  }
  return value;
}

function positiveInteger(env: Env, name: string, fallback?: number): number | undefined {
  const value = optional(env, name);
  if (value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new ConfigError(`${name} must be a positive integer`);
  }
  return number;
}

/**
 * Lee la configuración desde variables de entorno. Las credenciales y los
 * límites de cuota no tienen valores por defecto.
 */
export function loadConfig(env: Env): ServerConfig {
  const sharedStore = optional(env, "SHARED_STORE") ?? "redis";
  if (sharedStore !== "redis" && sharedStore !== "memory") {
    throw new ConfigError("SHARED_STORE must be 'redis' or 'memory'");
  }

  let quotaPolicies: Record<string, ProviderQuotaPolicy>;
  try {
    quotaPolicies = quotaPoliciesFromEnv(env, [TMDB_QUOTA_PROVIDER]);
  } catch (error) {
    throw new ConfigError(error instanceof Error ? error.message : String(error));
  }

  const path = optional(env, "MCP_PATH") ?? DEFAULT_MCP_PATH;
  if (!path.startsWith("/")) {
    throw new ConfigError("MCP_PATH must start with '/'");
  }

  return {
    host: optional(env, "MCP_HOST") ?? DEFAULT_HOST,
    port: positiveInteger(env, "MCP_PORT", DEFAULT_PORT) ?? DEFAULT_PORT,
    path,
    allowedHosts: (optional(env, "MCP_ALLOWED_HOSTS") ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter((host) => host !== ""),
    tmdb: {
      accessToken: required(env, "TMDB_READ_ACCESS_TOKEN"),
      language: optional(env, "TMDB_LANGUAGE"),
      timeoutMs: positiveInteger(env, "TMDB_TIMEOUT_MS")
    },
    sharedStore,
    // Con varias réplicas, Redis es obligatorio para compartir cuotas y caché.
    redisUrl: sharedStore === "redis" ? required(env, "REDIS_URL") : null,
    quotaPolicies
  };
}
