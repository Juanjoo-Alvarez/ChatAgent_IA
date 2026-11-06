import type { QuotaManager } from "../quota/QuotaManager";
import { createQuotaFetch } from "./quotaFetch";
import { createRetryFetch, type RetryOptions } from "./retryFetch";
import type { FetchLike } from "./types";

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
