import { ReadThroughCache, buildCacheKey, createResilientFetch, QuotaExceededError, QuotaUnavailableError, type CacheStore, type FetchLike, type QuotaManager } from "@agichat/external-api";
import { z } from "zod";
import { BooksError } from "./GoogleBooksClient.js";

export interface AdaptationEvidence {
  readonly movieId: number;
  readonly titles: readonly string[];
  readonly authors: readonly string[];
  readonly originalYear?: number;
  readonly sources: readonly string[];
}
export interface AdaptationLookup { findByMovie(movieId: number): Promise<readonly AdaptationEvidence[]> }

const cell = z.object({ value: z.string().min(1).max(1000) });
const responseSchema = z.object({ results: z.object({ bindings: z.array(z.object({
  film: cell, work: cell, title: cell, authorName: cell, published: cell.optional()
})).max(100) }) });
const entityId = (url: string) => /^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(url)?.[1];

/** P4947 identifica la película de TMDB; P144 y P50 identifican obra y autor.
 * No acepta consultas SPARQL, URLs ni asociaciones producidas por el LLM.
 */
export class WikidataAdaptationCatalog implements AdaptationLookup {
  private readonly cache: ReadThroughCache;
  private readonly http: FetchLike;
  public constructor(options: { quota: QuotaManager; cache: CacheStore; fetch?: FetchLike | undefined }) {
    this.cache = new ReadThroughCache(options.cache);
    this.http = createResilientFetch({ provider: "wikidata", quota: options.quota, fetch: options.fetch, retry: { maxAttempts: 1 } });
  }
  public async findByMovie(movieId: number): Promise<readonly AdaptationEvidence[]> {
    if (!Number.isSafeInteger(movieId) || movieId < 1) { throw new BooksError("invalid_request"); }
    return this.cache.getOrLoad(buildCacheKey("adaptations:v1", "tmdb", { movieId }), async () => {
      const query = `SELECT DISTINCT ?film ?work ?title ?authorName ?published WHERE {
        ?film wdt:P4947 "${movieId}"; wdt:P144 ?work.
        ?work wdt:P50 ?author; rdfs:label ?title.
        ?author rdfs:label ?authorName.
        FILTER(LANG(?title) IN ("en", "es") && LANG(?authorName) IN ("en", "es"))
        OPTIONAL { ?work wdt:P577 ?published. }
      } LIMIT 100`;
      const url = new URL("https://query.wikidata.org/sparql");
      url.searchParams.set("query", query);
      url.searchParams.set("format", "json");
      try {
        const response = await this.http(url.toString(), { redirect: "error", signal: AbortSignal.timeout(5000),
          headers: { Accept: "application/sparql-results+json", "User-Agent": "AGIChat-Academic/0.2 (CC3116; read-only adaptation lookup)" } });
        if (!response.ok) {
          await response.body?.cancel();
          throw new BooksError(response.status === 429 ? "rate_limited" : "unavailable", true, "wikidata");
        }
        const rows = responseSchema.parse(await response.json()).results.bindings;
        const works = new Map<string, { titles: Set<string>; authors: Set<string>; years: number[]; film: string }>();
        for (const row of rows) {
          const film = entityId(row.film.value), work = entityId(row.work.value);
          if (film === undefined || work === undefined) { throw new BooksError("bad_response", false, "wikidata"); }
          const record = works.get(work) ?? { titles: new Set<string>(), authors: new Set<string>(), years: [], film };
          record.titles.add(row.title.value);
          record.authors.add(row.authorName.value);
          const year = /^(\d{4})-/.exec(row.published?.value ?? "")?.[1];
          if (year !== undefined) { record.years.push(Number(year)); }
          works.set(work, record);
        }
        return [...works].map(([work, record]) => ({ movieId, titles: [...record.titles], authors: [...record.authors],
          ...(record.years.length ? { originalYear: Math.min(...record.years) } : {}),
          sources: [`https://www.wikidata.org/wiki/${record.film}`, `https://www.wikidata.org/wiki/${work}`]
        }));
      } catch (error) {
        if (error instanceof BooksError) { throw error; }
        throw new BooksError(error instanceof QuotaExceededError ? "quota_exhausted" : error instanceof QuotaUnavailableError ? "quota_unavailable" : "adaptation_unavailable", true, "wikidata");
      }
    }, { ttlMs: 86400000 });
  }
}
