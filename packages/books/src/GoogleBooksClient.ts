import {
  ReadThroughCache, buildCacheKey, createResilientFetch, QuotaExceededError, QuotaUnavailableError,
  type CacheStore, type FetchLike, type QuotaManager, type RetryOptions
} from "@agichat/external-api";
import { looksLikeInstructions, stripInvisibleCharacters } from "@agichat/tmdb";
import { z } from "zod";
import { bookIdSchema, searchBooksInput, type Book } from "./schemas.js";

export const GOOGLE_BOOKS_PROVIDER = "google-books";
export class BooksError extends Error {
  public constructor(public readonly code: string, public readonly retryable = false) {
    super(`Google Books: ${code}`);
    this.name = "BooksError";
  }
}
const volumeSchema = z.object({ id: bookIdSchema, volumeInfo: z.object({
  title: z.string().nullish(), authors: z.array(z.string()).nullish(),
  description: z.string().nullish(), publishedDate: z.string().nullish(),
  industryIdentifiers: z.array(z.object({ type: z.string(), identifier: z.string() })).nullish()
}).default({}) });
const clean = (value: string): string => stripInvisibleCharacters(value).trim();
export function normalizeBook(value: unknown): Book {
  const parsed = volumeSchema.safeParse(value);
  if (!parsed.success) { throw new BooksError("bad_response"); }
  const { id, volumeInfo: info } = parsed.data;
  return {
    id, title: info.title ? clean(info.title).slice(0, 500) || null : null,
    authors: (info.authors ?? []).map(clean).filter(Boolean).slice(0, 30),
    description: info.description ? clean(info.description).slice(0, 16000) || null : null,
    published_date: info.publishedDate ?? null,
    identifiers: info.industryIdentifiers ?? [],
    reference: { provider: "google-books", id }, url: `https://books.google.com/books?id=${encodeURIComponent(id)}`,
    provenance: { source: "google-books", trust: "untrusted_external",
      suspected_instructions: [info.title ?? "", info.description ?? "", ...(info.authors ?? [])].some(looksLikeInstructions) }
  };
}
export interface GoogleBooksOptions {
  readonly quota: QuotaManager;
  readonly cache: CacheStore;
  readonly apiKey?: string | undefined;
  readonly fetch?: FetchLike | undefined;
  readonly retry?: RetryOptions | undefined;
  readonly timeoutMs?: number | undefined;
  readonly ttlMs?: number | undefined;
}
export class GoogleBooksClient {
  private readonly http: FetchLike;
  private readonly cache: ReadThroughCache;
  private readonly timeoutMs: number;
  private readonly ttlMs: number;
  public constructor(private readonly options: GoogleBooksOptions) {
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.ttlMs = options.ttlMs ?? 3600000;
    if (![this.timeoutMs, this.ttlMs].every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new BooksError("invalid_request");
    }
    this.http = createResilientFetch({ provider: GOOGLE_BOOKS_PROVIDER, quota: options.quota, fetch: options.fetch, retry: options.retry });
    this.cache = new ReadThroughCache(options.cache);
  }
  public async searchBooks(input: z.input<typeof searchBooksInput>) {
    const parsed = searchBooksInput.safeParse(input);
    if (!parsed.success) { throw new BooksError("invalid_request"); }
    const args = parsed.data;
    return this.cache.getOrLoad(buildCacheKey("google-books:v1", "search", args), async () => {
      const data = await this.request("", { q: args.query, startIndex: String(args.start_index), maxResults: String(args.max_results) });
      const result = z.object({ items: z.array(z.unknown()).optional(), totalItems: z.number().int().nonnegative() }).safeParse(data);
      if (!result.success) { throw new BooksError("bad_response"); }
      const results: Book[] = [];
      let skipped = 0;
      for (const item of result.data.items ?? []) {
        try { results.push(normalizeBook(item)); } catch { skipped += 1; }
      }
      return { results, total_items: result.data.totalItems, start_index: args.start_index, skipped,
        ambiguous: results.length > 1, references: results.map((book) => book.reference) };
    }, { ttlMs: this.ttlMs });
  }
  public async getBookDetails(id: string): Promise<Book> {
    if (!bookIdSchema.safeParse(id).success) { throw new BooksError("invalid_request"); }
    return this.cache.getOrLoad(buildCacheKey("google-books:v1", "details", { id }), async () => {
      const book = normalizeBook(await this.request(`/${encodeURIComponent(id)}`, {}));
      if (book.id !== id) { throw new BooksError("bad_response"); }
      return book;
    }, { ttlMs: this.ttlMs });
  }
  private async request(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`https://www.googleapis.com/books/v1/volumes${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    if (this.options.apiKey) { url.searchParams.set("key", this.options.apiKey); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.http(url.toString(), { signal: controller.signal, redirect: "error" });
      if (!response.ok) {
        const code = response.status === 404 ? "not_found" : response.status === 429 ? "rate_limited"
          : response.status === 401 || response.status === 403 ? "invalid_credentials" : "unavailable";
        throw new BooksError(code, response.status === 429 || response.status >= 500);
      }
      try { return await response.json(); } catch { throw new BooksError("bad_response"); }
    } catch (error) {
      if (controller.signal.aborted) { throw new BooksError("timeout", true); }
      if (error instanceof BooksError) { throw error; }
      if (error instanceof QuotaExceededError) { throw new BooksError("quota_exhausted", true); }
      if (error instanceof QuotaUnavailableError) { throw new BooksError("quota_unavailable", true); }
      throw new BooksError("network", true);
    } finally { clearTimeout(timer); }
  }
}
