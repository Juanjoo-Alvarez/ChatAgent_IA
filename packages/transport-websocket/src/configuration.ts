import type { WebSocketTransportAdapterOptions } from "./contracts";

/** Normaliza y valida la configuración una sola vez, antes de crear recursos. */
export function resolveConfiguration(options: WebSocketTransportAdapterOptions) {
  const url = new URL(options.url);
  if (!["ws:", "wss:"].includes(url.protocol)) {
    throw new TypeError("WebSocket URL must use the ws: or wss: protocol");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/chat") {
    throw new TypeError("WebSocket URL must use /chat without credentials, query or fragment");
  }
  const sessionUrl = new URL(url);
  sessionUrl.protocol = url.protocol === "wss:" ? "https:" : "http:";
  sessionUrl.pathname = "/sessions";
  const connectTimeoutMs = options.connectTimeoutMs ?? 10000;
  const responseTimeoutMs = options.responseTimeoutMs ?? 65000;
  const maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
  const reconnectDelayMs = options.reconnectDelayMs ?? 500;
  const maxReconnectDelayMs = options.maxReconnectDelayMs ?? 5000;
  for (const timeout of [connectTimeoutMs, responseTimeoutMs, reconnectDelayMs, maxReconnectDelayMs]) {
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2147483647) {
      throw new TypeError("Timeouts must be integers between 1 and 2147483647");
    }
  }
  if (!Number.isInteger(maxReconnectAttempts) || maxReconnectAttempts < 0 || maxReconnectAttempts > 10) {
    throw new TypeError("maxReconnectAttempts must be an integer between 0 and 10");
  }
  if (maxReconnectDelayMs < reconnectDelayMs) {
    throw new TypeError("maxReconnectDelayMs must be greater than or equal to reconnectDelayMs");
  }
  return {
    url, sessionUrl, protocols: options.protocols,
    // Las APIs nativas del navegador requieren conservar su receptor global.
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    createWebSocket: options.createWebSocket ?? ((endpoint: string, protocols?: string | string[]) => new WebSocket(endpoint, protocols)),
    createId: options.createId ?? (() => globalThis.crypto.randomUUID()),
    connectTimeoutMs, responseTimeoutMs, maxReconnectAttempts, reconnectDelayMs, maxReconnectDelayMs
  };
}

export type TransportConfiguration = ReturnType<typeof resolveConfiguration>;
