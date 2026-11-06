import { TmdbError, type TmdbErrorCode } from "@agichat/tmdb";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Mensajes en español para el consumidor; el código permite decidir qué hacer
// sin interpretar texto. Nunca incluyen credenciales ni URLs internas.
const MESSAGES: Record<TmdbErrorCode, string> = {
  invalid_request: "Los parámetros no son válidos para TMDB.",
  invalid_credentials: "El servidor no tiene credenciales válidas para TMDB.",
  not_found: "TMDB no tiene una película con ese identificador.",
  rate_limited: "TMDB limitó temporalmente las solicitudes. Intenta más tarde.",
  unavailable: "TMDB no está disponible en este momento. Intenta más tarde.",
  timeout: "TMDB no respondió a tiempo. Intenta más tarde.",
  network: "No fue posible conectar con TMDB. Intenta más tarde.",
  unexpected_status: "TMDB respondió de forma inesperada.",
  bad_response: "TMDB devolvió una respuesta que no se pudo procesar.",
  quota_exhausted: "Se alcanzó el límite de consultas configurado para TMDB. Intenta más tarde.",
  quota_unavailable: "No se pudo verificar la cuota de consultas; la solicitud no se envió."
};

export interface ToolErrorPayload {
  readonly error: {
    readonly code: TmdbErrorCode | "internal_error";
    readonly message: string;
    readonly retryable: boolean;
    readonly retry_after_ms: number | null;
    readonly details: Readonly<Record<string, unknown>> | null;
  };
}

export function toErrorPayload(error: unknown): ToolErrorPayload {
  if (error instanceof TmdbError) {
    return {
      error: {
        code: error.code,
        message: MESSAGES[error.code],
        retryable: error.retryable,
        retry_after_ms: error.retryAfterMs ?? null,
        // Los detalles de validación ayudan a corregir la llamada; los demás
        // pueden contener datos internos y no se exponen.
        details: error.code === "invalid_request" ? (error.details ?? null) : null
      }
    };
  }
  return {
    error: {
      code: "internal_error",
      message: "Ocurrió un error interno al procesar la herramienta.",
      retryable: false,
      retry_after_ms: null,
      details: null
    }
  };
}

/**
 * Resultado de error MCP. No incluye `structuredContent`: los clientes validan
 * ese campo contra el esquema de éxito de la herramienta.
 */
export function toolErrorResult(payload: ToolErrorPayload): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload) }]
  };
}
