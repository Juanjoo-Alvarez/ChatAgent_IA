import { QuotaExceededError, QuotaUnavailableError } from "../quota/errors.js";
import type { FetchLike } from "./types.js";

export interface RetryOptions {
  /** Intentos totales, incluido el primero. */
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Si `Retry-After` pide esperar más que esto, se devuelve la respuesta sin reintentar. */
  readonly maxRetryAfterMs?: number;
  readonly retryOnStatus?: readonly number[];
  readonly random?: () => number;
  readonly sleep?: (ms: number, signal: AbortSignal | undefined) => Promise<void>;
  readonly onRetry?: (event: RetryEvent) => void;
}

export interface RetryEvent {
  readonly attempt: number;
  readonly delayMs: number;
  readonly reason: "status" | "network";
  readonly status?: number | undefined;
}

export const DEFAULT_RETRY_OPTIONS = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 4000,
  maxRetryAfterMs: 10_000,
  retryOnStatus: [429, 500, 502, 503, 504]
} as const;

export function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (header === null) {
    return undefined;
  }
  if (/^\d+$/.test(header.trim())) {
    return Number(header.trim()) * 1000;
  }
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function isQuotaError(error: unknown): boolean {
  return error instanceof QuotaExceededError || error instanceof QuotaUnavailableError;
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");
}

/**
 * Reintenta errores transitorios (429, 5xx y fallos de red) con backoff
 * exponencial y jitter completo, con un número máximo de intentos. Al
 * componerse sobre `createQuotaFetch`, cada reintento consume cuota.
 */
export function createRetryFetch(fetchImpl: FetchLike, options: RetryOptions = {}): FetchLike {
  const maxAttempts = options.maxAttempts ?? DEFAULT_RETRY_OPTIONS.maxAttempts;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_RETRY_OPTIONS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? DEFAULT_RETRY_OPTIONS.maxRetryAfterMs;
  const retryOnStatus = new Set(options.retryOnStatus ?? DEFAULT_RETRY_OPTIONS.retryOnStatus);
  const random = options.random ?? Math.random;
  const wait = options.sleep ?? sleep;
  const onRetry = options.onRetry ?? (() => undefined);

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("maxAttempts must be a positive integer");
  }

  const backoff = (attempt: number): number =>
    Math.round(random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));

  return async (input, init) => {
    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(input, init);
      } catch (error) {
        if (attempt >= maxAttempts || isQuotaError(error) || isAbort(error, init.signal ?? undefined)) {
          throw error;
        }
        const delayMs = backoff(attempt);
        onRetry({ attempt, delayMs, reason: "network" });
        await wait(delayMs, init.signal ?? undefined);
        continue;
      }

      if (attempt >= maxAttempts || !retryOnStatus.has(response.status)) {
        return response;
      }

      const requested = retryAfterMs(response);
      if (requested !== undefined && requested > maxRetryAfterMs) {
        return response;
      }
      const delayMs = requested ?? backoff(attempt);

      // Liberar el cuerpo evita retener la conexión mientras se espera.
      await response.body?.cancel().catch(() => undefined);
      onRetry({ attempt, delayMs, reason: "status", status: response.status });
      await wait(delayMs, init.signal ?? undefined);
    }
  };
}
