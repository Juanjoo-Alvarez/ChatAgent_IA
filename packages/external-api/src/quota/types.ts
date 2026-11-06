/** Ventana deslizante: como máximo `limit` solicitudes en `windowMs` milisegundos. */
export interface QuotaWindow {
  readonly limit: number;
  readonly windowMs: number;
}

export interface ProviderQuotaPolicy {
  /** Todas las ventanas deben tener cupo para que una solicitud se permita. */
  readonly windows: readonly QuotaWindow[];
}

export interface QuotaWindowUsage extends QuotaWindow {
  readonly used: number;
  readonly remaining: number;
}

export interface QuotaAcquireResult {
  readonly allowed: boolean;
  /** Espera mínima estimada hasta que se libere cupo; `0` si se permitió. */
  readonly retryAfterMs: number;
  readonly windows: readonly QuotaWindowUsage[];
}

/**
 * Almacenamiento de contadores. Cada operación debe ser atómica respecto de
 * todas las réplicas que comparten el almacenamiento.
 */
export interface QuotaStore {
  tryAcquire(
    provider: string,
    windows: readonly QuotaWindow[],
    leaseId: string
  ): Promise<QuotaAcquireResult>;
  release(provider: string, windows: readonly QuotaWindow[], leaseId: string): Promise<void>;
  usage(provider: string, windows: readonly QuotaWindow[]): Promise<readonly QuotaWindowUsage[]>;
}

export interface ProviderQuotaUsage {
  readonly provider: string;
  readonly available: boolean;
  readonly windows: readonly QuotaWindowUsage[];
}

export type QuotaEvent =
  | { readonly type: "acquired"; readonly provider: string; readonly leaseId: string; readonly windows: readonly QuotaWindowUsage[] }
  | { readonly type: "rejected"; readonly provider: string; readonly retryAfterMs: number; readonly windows: readonly QuotaWindowUsage[] }
  | { readonly type: "released"; readonly provider: string; readonly leaseId: string }
  | { readonly type: "store_error"; readonly provider: string; readonly error: unknown };

export function toWindowUsage(window: QuotaWindow, used: number): QuotaWindowUsage {
  return {
    limit: window.limit,
    windowMs: window.windowMs,
    used,
    remaining: Math.max(0, window.limit - used)
  };
}
