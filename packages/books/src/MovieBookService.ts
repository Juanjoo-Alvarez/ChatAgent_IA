import type { Movie } from "@agichat/tmdb";
import type { z } from "zod";
import type { AdaptationEvidence, AdaptationLookup } from "./AdaptationCatalog.js";
import type { GoogleBooksClient } from "./GoogleBooksClient.js";
import { compareMovieBook, matchesAdaptation, VERIFIED_ADAPTATIONS } from "./comparison.js";
import { comparisonSchema, type Book, type compareInput } from "./schemas.js";

export const reviewedAssociations = (movieId: number): AdaptationEvidence[] => VERIFIED_ADAPTATIONS
  .filter((record) => record.movieId === movieId).map((record) => ({ movieId, titles: record.bookTitles,
    authors: [record.author], originalYear: record.originalYear, sources: record.sources }));

/** Orquesta proveedores desde puertos pequeños. Nunca usa IDs inventados por el modelo. */
export class MovieBookService {
  public constructor(private readonly movies: { getMovieDetails(id: number): Promise<Movie> },
    private readonly books: Pick<GoogleBooksClient, "getBookDetails" | "searchBooks">,
    private readonly adaptations?: AdaptationLookup) {}

  public async compare(args: z.output<typeof compareInput>) {
    const movie = await this.movies.getMovieDetails(args.movie_id);
    const reviewed = reviewedAssociations(movie.id);
    let book = args.book_id === undefined ? undefined : await this.books.getBookDetails(args.book_id);
    // El catálogo revisado sigue siendo útil sin red adicional. Otros títulos se resuelven por P4947/P144.
    if (book !== undefined && compareMovieBook(movie, book, args.preferences).status === "adaptation_identified") {
      return compareMovieBook(movie, book, args.preferences);
    }
    const associations = reviewed.length ? reviewed : await this.adaptations?.findByMovie(movie.id) ?? [];
    if (book === undefined) {
      const choices: Book[] = [];
      // Presupuesto por comparación: como máximo dos obras y dos búsquedas bibliográficas.
      for (const work of associations.slice(0, 2)) {
        const term = (value: string, max: number) => value.replace(/["\\]/g, " ").replace(/\s+/g, " ").slice(0, max);
        const title = term(work.titles[0]!, 180), author = term(work.authors[0]!, 70);
        const query = `intitle:"${title}" inauthor:"${author}"`;
        const page = await this.books.searchBooks({ query, max_results: 10 });
        const match = page.results.find((candidate) => matchesAdaptation(candidate, work));
        if (match !== undefined) { choices.push(match); }
      }
      if (choices.length === 1) { book = choices[0]; }
      else {
        return comparisonSchema.parse({ status: choices.length > 1 ? "possible_match" : "insufficient_evidence",
          reasons: [choices.length > 1
            ? `Esta película tiene varias obras de origen. Elige un libro: ${choices.map((entry) => `${entry.title} (${entry.id})`).join("; ")}.`
            : associations.length ? `Identifiqué la obra de origen, pero no una edición coincidente en Google Books: ${associations.map((entry) => `${entry.titles[0]} — ${entry.authors[0]}`).join("; ")}.`
              : "No encontré una asociación bibliográfica verificable para esta película en las fuentes consultadas. Esto no prueba que no esté basada en un libro."],
          similarities: [], differences: [], recommendation: { verdict: "undetermined", reasons: [] },
          limitations: [], sources: [movie.tmdb_url, ...associations.flatMap((entry) => entry.sources)],
          references: choices.map((entry) => entry.reference), book: null, movie_id: movie.id,
          movie: { id: movie.id, title: movie.title, year: movie.year, poster: movie.poster, imdb_id: movie.imdb_id }
        });
      }
    }
    return compareMovieBook(movie, book!, args.preferences, associations);
  }
}
