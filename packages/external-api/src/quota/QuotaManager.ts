import { QuotaConfigurationError, QuotaExceededError, QuotaUnavailableError } from "./errors.js";
import type {
  ProviderQuotaPolicy,
  ProviderQuotaUsage,
  QuotaEvent,
  QuotaStore,
  QuotaWindow
} from "./types.js";

const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Cupo reservado para una solicitud. Se libera solo si nunca llegó a enviarse. */
export interface QuotaLease {
  readonly provider: string;
  readonly id: string;
  release(): Promise<void>;
}

export interface QuotaManagerOptions {
  readonly store: QuotaStore;
  /** Una política por proveedor; cada proveedor tiene contadores propios. */
  readonly policies: Readonly<Record<string, ProviderQuotaPolicy>>;
  readonly createLeaseId?: () => string;
  readonly onEvent?: (event: QuotaEvent) => void;
}

function validatePolicy(provider: string, policy: ProviderQuotaPolicy): void {
  if (!PROVIDER_PATTERN.test(provider)) {
    throw new QuotaConfigurationError(
      `Invalid provider id "${provider}": use lowercase letters, digits, "_" or "-"`
    );
  }
  if (policy.windows.length === 0) {
    throw new QuotaConfigurationError(`Provider "${provider}" needs at least one quota window`);
  }

  const seen = new Set<number>();
  for (const window of policy.windows) {
    if (!Number.isSafeInteger(window.limit) || window.limit < 1) {
      throw new QuotaConfigurationError(`Provider "${provider}" has a limit that is not a positive integer`);
    }
    if (!Number.isSafeInteger(window.windowMs) || window.windowMs < 1) {
      throw new QuotaConfigurationError(`Provider "${provider}" has a window that is not a positive integer`);
    }
    if (seen.has(window.windowMs)) {
      throw new QuotaConfigurationError(`Provider "${provider}" repeats the window ${window.windowMs} ms`);
    }
    seen.add(window.windowMs);
  }
}

/**
 * Política de cuotas reutilizable por cualquier cliente de APIs externas.
 * Registra cada solicitud antes de enviarla y rechaza las que excederían
 * algún límite. La atomicidad entre réplicas la aporta el `QuotaStore`.
 */
export class QuotaManager {
  private readonly store: QuotaStore;
  private readonly policies: ReadonlyMap<string, readonly QuotaWindow[]>;
  private readonly createLeaseId: () => string;
  private readonly onEvent: (event: QuotaEvent) => void;

  public constructor(options: QuotaManagerOptions) {
    const policies = new Map<string, readonly QuotaWindow[]>();
    for (const [provider, policy] of Object.entries(options.policies)) {
      validatePolicy(provider, policy);
      policies.set(provider, [...policy.windows]);
    }

    this.store = options.store;
    this.policies = policies;
    this.createLeaseId = options.createLeaseId ?? (() => crypto.randomUUID());
    this.onEvent = options.onEvent ?? (() => undefined);
  }

  public get providers(): readonly string[] {
    return [...this.policies.keys()];
  }

  /** Registra una solicitud o lanza `QuotaExceededError` si no hay cupo. */
  public async acquire(provider: string): Promise<QuotaLease> {
    const windows = this.windowsFor(provider);
    const leaseId = this.createLeaseId();

    const result = await this.withStore(provider, () => this.store.tryAcquire(provider, windows, leaseId));
    if (!result.allowed) {
      this.onEvent({ type: "rejected", provider, retryAfterMs: result.retryAfterMs, windows: result.windows });
      throw new QuotaExceededError(provider, result.retryAfterMs, result.windows);
    }

    this.onEvent({ type: "acquired", provider, leaseId, windows: result.windows });

    let released = false;
    return {
      provider,
      id: leaseId,
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        await this.withStore(provider, () => this.store.release(provider, windows, leaseId));
        this.onEvent({ type: "released", provider, leaseId });
      }
    };
  }

  /** Consulta el consumo actual sin registrar ninguna solicitud. */
  public async usage(provider: string): Promise<ProviderQuotaUsage> {
    const windows = this.windowsFor(provider);
    const usage = await this.withStore(provider, () => this.store.usage(provider, windows));
    return {
      provider,
      available: usage.every((window) => window.remaining > 0),
      windows: usage
    };
  }

  private windowsFor(provider: string): readonly QuotaWindow[] {
    const windows = this.policies.get(provider);
    if (windows === undefined) {
      throw new QuotaConfigurationError(`No quota policy configured for provider "${provider}"`);
    }
    return windows;
  }

  private async withStore<T>(provider: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.onEvent({ type: "store_error", provider, error });
      throw new QuotaUnavailableError(provider, error);
    }
  }
}
