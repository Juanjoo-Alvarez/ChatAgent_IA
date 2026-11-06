import type { QuotaManager } from "../quota/QuotaManager.js";
import type { FetchLike } from "./types.js";

// Errores en los que la conexión nunca se estableció, así que la solicitud no
// llegó al proveedor. Un ECONNRESET, en cambio, puede ocurrir después del
// envío y por eso sí se contabiliza.
const NOT_SENT_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT"
]);

function errorCodes(error: unknown, depth = 0): string[] {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return [];
  }
  const record = error as { code?: unknown; cause?: unknown; errors?: unknown };
  const own = typeof record.code === "string" ? [record.code] : [];
  const nested = Array.isArray(record.errors)
    ? record.errors.flatMap((inner) => errorCodes(inner, depth + 1))
    : [];
  return [...own, ...nested, ...errorCodes(record.cause, depth + 1)];
}

/**
 * Indica si el error demuestra que la solicitud no se envió. Si no puede
 * determinarse con certeza, devuelve `false` y la solicitud queda contada.
 */
export function isRequestNotSent(error: unknown): boolean {
  const codes = errorCodes(error);
  return codes.length > 0 && codes.every((code) => NOT_SENT_CODES.has(code));
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

/**
 * Envuelve `fetch` para registrar cada intento en la cuota del proveedor.
 * - Si no hay cupo, lanza `QuotaExceededError` sin llamar al proveedor.
 * - Si la conexión falla antes del envío, devuelve el cupo.
 * - Cualquier otra respuesta o error queda contabilizado.
 */
export function createQuotaFetch(fetchImpl: FetchLike, quota: QuotaManager, provider: string): FetchLike {
  return async (input, init) => {
    if (init.signal?.aborted === true) {
      throw abortReason(init.signal);
    }

    const lease = await quota.acquire(provider);
    try {
      return await fetchImpl(input, init);
    } catch (error) {
      if (isRequestNotSent(error)) {
        // Si devolver el cupo falla, conservarlo es el error menos dañino.
        await lease.release().catch(() => undefined);
      }
      throw error;
    }
  };
}
