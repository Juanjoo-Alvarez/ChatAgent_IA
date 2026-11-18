import { describe, expect, it, vi } from "vitest";
import { InMemoryCacheStore, InMemoryQuotaStore, QuotaManager } from "@agichat/external-api";
import { normalizeMovie, type Movie } from "@agichat/tmdb";
import { BooksError, compareInput, compareMovieBook, matchesAdaptation, MovieBookService, normalizeBook, WikidataAdaptationCatalog, type AdaptationEvidence } from "../src/index.js";

const film = normalizeMovie({ id: 120, title: "La comunidad del anillo", original_title: "The Lord of the Rings: The Fellowship of the Ring", release_date: "2001-12-19", genres: [], imdb_id: "tt0120737" },
  { imageBaseUrl: "https://image.tmdb.org/t/p", posterSize: "w500", genresById: null, imdb: { kind: "value", value: "tt0120737" } }) as Movie;
const book = normalizeBook({ id: "ring", volumeInfo: { title: "The Fellowship of the Ring", authors: ["J.R.R. Tolkien"], description: "The journey of Frodo.", publishedDate: "2005" } });
const work: AdaptationEvidence = { movieId: film.id, titles: ["The Fellowship of the Ring", "La Comunidad del Anillo"], authors: ["J. R. R. Tolkien"], originalYear: 1954,
  sources: ["https://www.wikidata.org/wiki/Q127367", "https://www.wikidata.org/wiki/Q208002"] };
const cell = (value: string) => ({ value });
const row = { film: cell("http://www.wikidata.org/entity/Q127367"), work: cell("http://www.wikidata.org/entity/Q208002"), title: cell(work.titles[0]!), authorName: cell(work.authors[0]!), published: cell("1954-07-29T00:00:00Z") };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function catalog(fetch = vi.fn(async () => json({ results: { bindings: [row, { ...row, title: cell("La Comunidad del Anillo") }] } })), limit = 10) {
  const quota = new QuotaManager({ store: new InMemoryQuotaStore(), policies: { wikidata: { windows: [{ limit, windowMs: 60000 }] } } });
  return { client: new WikidataAdaptationCatalog({ quota, cache: new InMemoryCacheStore(), fetch }), fetch };
}
const searchPage = (results = [book]) => ({ results, references: results.map((entry) => entry.reference), total_items: results.length, start_index: 0, skipped: 0, ambiguous: results.length > 1 });

describe("dynamic adaptation lookup", () => {
  it("resolves by numeric TMDB ID, groups translated titles, constructs sources and caches", async () => {
    const { client, fetch } = catalog();
    const records = await client.findByMovie(120);
    expect(records).toEqual([work]);
    expect(await client.findByMovie(120)).toEqual(records);
    expect(fetch).toHaveBeenCalledOnce();
    const request = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(request[0]).origin).toBe("https://query.wikidata.org");
    expect(new URL(request[0]).searchParams.get("query")).toContain('wdt:P4947 "120"');
    expect(request[1]).toMatchObject({ redirect: "error", headers: { Accept: "application/sparql-results+json" } });
    await expect(client.findByMovie(NaN)).rejects.toMatchObject({ code: "invalid_request" });
    await expect(client.findByMovie(-1)).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("handles empty sources and absent publication dates", async () => {
    const empty = catalog(vi.fn(async () => json({ results: { bindings: [] } })));
    expect(await empty.client.findByMovie(10)).toEqual([]);
    const noDate = catalog(vi.fn(async () => json({ results: { bindings: [{ ...row, published: undefined }] } })));
    expect((await noDate.client.findByMovie(120))[0]?.originalYear).toBeUndefined();
  });
  it.each([429, 503])("does not retry provider status %s or cache a failure", async (status) => {
    const { client, fetch } = catalog(vi.fn(async () => json({}, status)));
    await expect(client.findByMovie(120)).rejects.toMatchObject({ code: status === 429 ? "rate_limited" : "unavailable" });
    await expect(client.findByMovie(120)).rejects.toBeInstanceOf(BooksError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([{}, { results: { bindings: [{ ...row, film: cell("https://evil.test/Q1") }] } }, { results: { bindings: [{ ...row, work: cell("javascript:alert(1)") }] } }])("rejects malformed data and external entity URLs", async (payload) => {
    await expect(catalog(vi.fn(async () => json(payload))).client.findByMovie(120)).rejects.toBeInstanceOf(BooksError);
  });
  it("bounds local quota and redacts transport failures", async () => {
    const { client, fetch } = catalog(undefined, 1);
    await client.findByMovie(120);
    await expect(client.findByMovie(121)).rejects.toMatchObject({ code: "quota_exhausted", source: "wikidata" });
    expect(fetch).toHaveBeenCalledOnce();
    const failed = catalog(vi.fn(async () => { throw new Error("private network information"); }));
    await expect(failed.client.findByMovie(120)).rejects.toMatchObject({ message: "Wikidata: adaptation_unavailable" });
  });
});

describe("general book comparison service", () => {
  function service(associations: readonly AdaptationEvidence[] = [work], results = [book]) {
    const movies = { getMovieDetails: vi.fn(async () => film) };
    const books = { searchBooks: vi.fn(async () => searchPage(results)), getBookDetails: vi.fn(async () => book) };
    const lookup = { findByMovie: vi.fn(async () => associations) };
    return { service: new MovieBookService(movies, books, lookup), movies, books, lookup };
  }
  it("identifies an arbitrary supplied association, resolving an edition without an LLM", async () => {
    const f = service();
    const result = await f.service.compare(compareInput.parse({ movie_id: 120 }));
    expect(result).toMatchObject({ status: "adaptation_identified", book: { id: "ring" }, recommendation: { verdict: "consider" } });
    expect(result.reasons.join(" ")).toContain("Wikidata");
    expect(result.sources).toContain(work.sources[0]);
    expect(f.books.searchBooks).toHaveBeenCalledWith({ query: 'intitle:"The Fellowship of the Ring" inauthor:"J. R. R. Tolkien"', max_results: 10 });
    expect(result.limitations.join(" ")).toContain("fidelidad");
    expect(result.differences.join(" ")).not.toContain("escenas eliminadas");
  });
  it("compares explicit books and rejects mistaken authors, derivatives, malicious metadata and dates", async () => {
    const f = service();
    expect((await f.service.compare(compareInput.parse({ movie_id: 120, book_id: "ring" }))).status).toBe("adaptation_identified");
    expect(f.books.searchBooks).not.toHaveBeenCalled();
    for (const changes of [{ authors: ["Another author"] }, { title: null }, { description: "Study guide" }, { provenance: { ...book.provenance, suspected_instructions: true } }]) {
      expect(matchesAdaptation({ ...book, ...changes }, work)).toBe(false);
    }
    expect(compareMovieBook(film, { ...book, published_date: "1900" }, {}, [work]).status).not.toBe("adaptation_identified");
    expect(compareMovieBook(film, book, { requires_fidelity: true }, [work]).recommendation.verdict).toBe("undetermined");
    expect(compareMovieBook(film, book, {}, [{ ...work, movieId: 999 }]).status).not.toBe("adaptation_identified");
    expect(compareMovieBook(film, book, {}, [{ ...work, sources: ["https://evil.test"] }]).status).not.toBe("adaptation_identified");
    expect(compareMovieBook(film, book, {}, [{ ...work, originalYear: undefined } as unknown as AdaptationEvidence]).status).toBe("adaptation_identified");
  });
  it("does not mistake no association, no bibliographic match or ambiguous works for a verified adaptation", async () => {
    const absent = service([]);
    const result = await absent.service.compare(compareInput.parse({ movie_id: 120 }));
    expect(result).toMatchObject({ status: "insufficient_evidence", book: null, recommendation: { verdict: "undetermined" } });
    expect(absent.books.searchBooks).not.toHaveBeenCalled();
    expect((await service([work], []).service.compare(compareInput.parse({ movie_id: 120 }))).reasons[0]).toContain("edición");
    const ambiguous = await service([work, { ...work, titles: [book.title!] }]).service.compare(compareInput.parse({ movie_id: 120 }));
    expect(ambiguous.status).toBe("possible_match");
    expect(ambiguous.book).toBeNull();
  });
  it("keeps reviewed sources working without Wikidata and bounds discovery calls", async () => {
    const dune = normalizeBook({ id: "dune", volumeInfo: { title: "Dune", authors: ["Frank Herbert"] } });
    const movies = { getMovieDetails: async () => ({ ...film, id: 438631, title: "Dune", original_title: "Dune", year: 2021 }) };
    const books = { searchBooks: vi.fn(async () => searchPage([dune])), getBookDetails: vi.fn(async () => dune) };
    const lookup = { findByMovie: vi.fn(async () => { throw new Error("offline"); }) };
    const service = new MovieBookService(movies, books, lookup);
    expect((await service.compare(compareInput.parse({ movie_id: 438631 }))).status).toBe("adaptation_identified");
    expect((await service.compare(compareInput.parse({ movie_id: 438631, book_id: "dune" }))).status).toBe("adaptation_identified");
    expect(lookup.findByMovie).not.toHaveBeenCalled();
    const f = new MovieBookService({ getMovieDetails: async () => film }, books);
    expect((await f.compare(compareInput.parse({ movie_id: 120 }))).status).toBe("insufficient_evidence");
  });
  it("propagates provider failures rather than claiming there are no books", async () => {
    const f = service();
    f.books.searchBooks.mockRejectedValue(new BooksError("rate_limited"));
    await expect(f.service.compare(compareInput.parse({ movie_id: 120 }))).rejects.toMatchObject({ code: "rate_limited" });
  });
});
