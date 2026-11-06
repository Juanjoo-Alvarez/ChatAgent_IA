import type { QuotaWindowUsage } from "./types.js";

/** La cuota del proveedor está agotada; la solicitud no se envió ni se contó. */
export class QuotaExceededError extends Error {
  public readonly provider: string;
  public readonly retryAfterMs: number;
  public readonly windows: readonly QuotaWindowUsage[];

  public constructor(provider: string, retryAfterMs: number, windows: readonly QuotaWindowUsage[]) {
    super(`Quota exhausted for provider "${provider}"`);
    this.name = "QuotaExceededError";
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
    this.windows = windows;
  }
}

/**
 * No se pudo consultar el almacenamiento compartido. La política falla de
 * forma cerrada: sin poder verificar la cuota, no se llama al proveedor.
 */
export class QuotaUnavailableError extends Error {
  public readonly provider: string;

  public constructor(provider: string, cause: unknown) {
    super(`Quota store unavailable for provider "${provider}"`, { cause });
    this.name = "QuotaUnavailableError";
    this.provider = provider;
  }
}

export class QuotaConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "QuotaConfigurationError";
  }
}
