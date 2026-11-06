// API pública de utilidades para integraciones con servicios externos.
export type { RedisLike } from "./redis.js";

export {
  QuotaManager,
  type QuotaLease,
  type QuotaManagerOptions
} from "./quota/QuotaManager.js";
export { InMemoryQuotaStore, type InMemoryQuotaStoreOptions } from "./quota/InMemoryQuotaStore.js";
export {
  DEFAULT_QUOTA_KEY_PREFIX,
  RedisQuotaStore,
  type RedisQuotaStoreOptions
} from "./quota/RedisQuotaStore.js";
export { parseQuotaWindows, quotaEnvVariable, quotaPoliciesFromEnv } from "./quota/config.js";
export {
  QuotaConfigurationError,
  QuotaExceededError,
  QuotaUnavailableError
} from "./quota/errors.js";
export type {
  ProviderQuotaPolicy,
  ProviderQuotaUsage,
  QuotaAcquireResult,
  QuotaEvent,
  QuotaStore,
  QuotaWindow,
  QuotaWindowUsage
} from "./quota/types.js";

export type { FetchLike } from "./http/types.js";
export { createQuotaFetch, isRequestNotSent } from "./http/quotaFetch.js";
export {
  DEFAULT_RETRY_OPTIONS,
  createRetryFetch,
  sleep,
  type RetryEvent,
  type RetryOptions
} from "./http/retryFetch.js";
export { createResilientFetch, type ResilientFetchOptions } from "./http/resilientFetch.js";

export type { CacheStore } from "./cache/types.js";
export { InMemoryCacheStore, type InMemoryCacheStoreOptions } from "./cache/InMemoryCacheStore.js";
export {
  DEFAULT_CACHE_KEY_PREFIX,
  RedisCacheStore,
  escapeRedisPattern,
  type RedisCacheStoreOptions
} from "./cache/RedisCacheStore.js";
export {
  ReadThroughCache,
  type CacheLoadOptions,
  type ReadThroughCacheOptions
} from "./cache/ReadThroughCache.js";
export { buildCacheKey, canonicalJson } from "./cache/cacheKey.js";
