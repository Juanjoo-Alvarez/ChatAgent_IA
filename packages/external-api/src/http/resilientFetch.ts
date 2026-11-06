import type { QuotaManager } from "../quota/QuotaManager.js";
import { createQuotaFetch } from "./quotaFetch.js";
import { createRetryFetch, type RetryOptions } from "./retryFetch.js";
import type { FetchLike } from "./types.js";

export interface ResilientFetchOptions {
  readonly provider: string;
  readonly quota: QuotaManager;
  readonly fetch?: FetchLike | undefined;
  readonly retry?: RetryOptions | undefined;
}

/**
 * Composición recomendada: los reintentos envuelven la cuota, de modo que cada
 * intento real (también los reintentos) registra su propia solicitud.
 */
export function createResilientFetch(options: ResilientFetchOptions): FetchLike {
  const base: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  return createRetryFetch(createQuotaFetch(base, options.quota, options.provider), options.retry);
}
