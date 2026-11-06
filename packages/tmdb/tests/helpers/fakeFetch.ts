import type { FetchLike } from "../../src";

export interface RecordedCall {
  readonly url: URL;
  readonly init: RequestInit;
}

export type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

/** Simula la API de TMDB por ruta, sin red, y registra cada solicitud. */
export function createFakeFetch(routes: Record<string, Route>): {
  readonly fetch: FetchLike;
  readonly calls: RecordedCall[];
  readonly callsTo: (path: string) => RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const pathOf = (url: URL): string => url.pathname.replace(/^\/3/, "");

  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    calls.push({ url, init });
    const route = routes[pathOf(url)];
    if (route === undefined) {
      return jsonResponse({ status_code: 34, status_message: "Not found" }, 404);
    }
    return route(url, init);
  };

  return {
    fetch: fetchImpl,
    calls,
    callsTo: (path) => calls.filter((call) => pathOf(call.url) === path)
  };
}

/** Respuesta que nunca llega; solo termina cuando el cliente aborta la solicitud. */
export const hangingRoute: Route = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    });
  });
