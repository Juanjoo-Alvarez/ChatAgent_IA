/** Firma compatible con `fetch`; permite componer cuotas, reintentos y mocks. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
