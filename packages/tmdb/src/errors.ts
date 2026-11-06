export type TmdbErrorCode =
  | "invalid_request"
  | "invalid_credentials"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  | "network"
  | "unexpected_status"
  | "bad_response";

const RETRYABLE_CODES: ReadonlySet<TmdbErrorCode> = new Set([
  "rate_limited",
  "unavailable",
  "timeout",
  "network"
]);

export interface TmdbErrorOptions {
  readonly code: TmdbErrorCode;
  readonly message: string;
  readonly status?: number | undefined;
  readonly retryAfterMs?: number | undefined;
  readonly details?: Readonly<Record<string, unknown>> | undefined;
  readonly cause?: unknown;
}

/**
 * Error tipado de la integración con TMDB. Los mensajes nunca incluyen la
 * credencial: el token viaja en una cabecera y no forma parte de la URL.
 */
export class TmdbError extends Error {
  public readonly code: TmdbErrorCode;
  public readonly retryable: boolean;
  public readonly status: number | undefined;
  public readonly retryAfterMs: number | undefined;
  public readonly details: Readonly<Record<string, unknown>> | undefined;

  public constructor(options: TmdbErrorOptions) {
    super(
      options.message,
      options.cause === undefined ? undefined : { cause: options.cause }
    );
    this.name = "TmdbError";
    this.code = options.code;
    this.retryable = RETRYABLE_CODES.has(options.code);
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
  }

  public toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      status: this.status ?? null,
      retry_after_ms: this.retryAfterMs ?? null,
      details: this.details ?? null
    };
  }
}

/** Interpreta `Retry-After` en segundos o como fecha HTTP. */
export function parseRetryAfter(
  header: string | null,
  now: number = Date.now()
): number | undefined {
  if (header === null || header.trim() === "") {
    return undefined;
  }

  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) {
    return undefined;
  }
  return Math.max(0, date - now);
}

async function readTmdbStatusCode(response: Response): Promise<number | undefined> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "status_code" in body) {
      const code = (body as { status_code: unknown }).status_code;
      return typeof code === "number" ? code : undefined;
    }
  } catch {
    // El cuerpo de error es opcional; el estado HTTP basta para clasificarlo.
  }
  return undefined;
}

function codeForStatus(status: number): TmdbErrorCode {
  if (status === 401 || status === 403) {
    return "invalid_credentials";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (status === 400 || status === 422) {
    return "invalid_request";
  }
  if (status >= 500 && status <= 599) {
    return "unavailable";
  }
  return "unexpected_status";
}

export async function errorFromResponse(response: Response): Promise<TmdbError> {
  const tmdbStatusCode = await readTmdbStatusCode(response);

  return new TmdbError({
    code: codeForStatus(response.status),
    message: `TMDB responded with HTTP ${response.status}`,
    status: response.status,
    retryAfterMs: parseRetryAfter(response.headers.get("Retry-After")),
    details: tmdbStatusCode === undefined ? undefined : { tmdb_status_code: tmdbStatusCode }
  });
}
