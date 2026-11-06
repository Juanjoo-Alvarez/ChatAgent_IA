import { QuotaConfigurationError } from "./errors.js";
import type { ProviderQuotaPolicy, QuotaWindow } from "./types.js";

const UNIT_MS = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
} as const;

const WINDOW_PATTERN = /^(\d+)\s*\/\s*(\d+)(ms|s|m|h|d)$/;

/**
 * Interpreta límites con el formato `cantidad/duración`, separados por comas.
 * Ejemplo de formato: `"5/1s,300/1d"` equivale a 5 solicitudes por segundo y
 * 300 por día. Unidades válidas: ms, s, m, h y d.
 */
export function parseQuotaWindows(value: string): QuotaWindow[] {
  const parts = value.split(",").map((part) => part.trim()).filter((part) => part !== "");
  if (parts.length === 0) {
    throw new QuotaConfigurationError("Quota definition is empty");
  }

  return parts.map((part) => {
    const match = WINDOW_PATTERN.exec(part);
    if (match === null) {
      throw new QuotaConfigurationError(
        `Invalid quota window "${part}": expected <limit>/<duration><ms|s|m|h|d>, for example 40/10s`
      );
    }
    const [, limit, amount, unit] = match as unknown as [string, string, string, keyof typeof UNIT_MS];
    return { limit: Number(limit), windowMs: Number(amount) * UNIT_MS[unit] };
  });
}

export function quotaEnvVariable(provider: string): string {
  return `QUOTA_${provider.toUpperCase().replace(/-/g, "_")}`;
}

/**
 * Lee las políticas desde variables `QUOTA_<PROVEEDOR>`, por ejemplo
 * `QUOTA_TMDB` o `QUOTA_GOOGLE_BOOKS`. No hay valores por defecto: un
 * proveedor sin límite configurado es un error de configuración.
 */
export function quotaPoliciesFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  providers: readonly string[]
): Record<string, ProviderQuotaPolicy> {
  const policies: Record<string, ProviderQuotaPolicy> = {};
  for (const provider of providers) {
    const variable = quotaEnvVariable(provider);
    const value = env[variable];
    if (value === undefined || value.trim() === "") {
      throw new QuotaConfigurationError(`Missing quota configuration: set ${variable}`);
    }
    policies[provider] = { windows: parseQuotaWindows(value) };
  }
  return policies;
}
