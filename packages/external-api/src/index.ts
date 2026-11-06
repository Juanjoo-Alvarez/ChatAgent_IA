// API pública de utilidades para integraciones con servicios externos.
export type { RedisLike } from "./redis";

export {
  QuotaManager,
  type QuotaLease,
  type QuotaManagerOptions
} from "./quota/QuotaManager";
export { InMemoryQuotaStore, type InMemoryQuotaStoreOptions } from "./quota/InMemoryQuotaStore";
export {
  DEFAULT_QUOTA_KEY_PREFIX,
  RedisQuotaStore,
  type RedisQuotaStoreOptions
} from "./quota/RedisQuotaStore";
export { parseQuotaWindows, quotaEnvVariable, quotaPoliciesFromEnv } from "./quota/config";
export {
  QuotaConfigurationError,
  QuotaExceededError,
  QuotaUnavailableError
} from "./quota/errors";
export type {
  ProviderQuotaPolicy,
  ProviderQuotaUsage,
  QuotaAcquireResult,
  QuotaEvent,
  QuotaStore,
  QuotaWindow,
  QuotaWindowUsage
} from "./quota/types";

export type { FetchLike } from "./http/types";
export { createQuotaFetch, isRequestNotSent } from "./http/quotaFetch";
export {
  DEFAULT_RETRY_OPTIONS,
  createRetryFetch,
  sleep,
  type RetryEvent,
  type RetryOptions
} from "./http/retryFetch";
export { createResilientFetch, type ResilientFetchOptions } from "./http/resilientFetch";

export type { CacheStore } from "./cache/types";
export { InMemoryCacheStore, type InMemoryCacheStoreOptions } from "./cache/InMemoryCacheStore";
export {
  DEFAULT_CACHE_KEY_PREFIX,
  RedisCacheStore,
  escapeRedisPattern,
  type RedisCacheStoreOptions
} from "./cache/RedisCacheStore";
export {
  ReadThroughCache,
  type CacheLoadOptions,
  type ReadThroughCacheOptions
} from "./cache/ReadThroughCache";
export { buildCacheKey, canonicalJson } from "./cache/cacheKey";
