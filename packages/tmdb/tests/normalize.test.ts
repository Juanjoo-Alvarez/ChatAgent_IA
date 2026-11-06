import { describe, expect, it } from "vitest";

import {
  buildMovieReference,
  normalizeMovie,
  type ImdbLookup,
  type NormalizeContext
} from "../src";
import {
  ambiguousSearch,
  completeDetails,
  incompleteDetails,
  maliciousDetails,
  maliciousOverview
} from "./fixtures/tmdb";

const genresById = new Map([
  [18, "Drama"],
  [27, "Terror"]
]);

function context(
  imdb: ImdbLookup = { kind: "not_requested" },
  overrides: Partial<NormalizeContext> = {}
): NormalizeContext {
  return {
    imageBaseUrl: "https://image.tmdb.org/t/p",
    posterSize: "w500",
    genresById,
    imdb,
    ...overrides
  };
}

describe("normalizeMovie", () => {
  it("normalizes a complete movie and prefers the IMDb reference", () => {
    const movie = normalizeMovie(completeDetails, context({ kind: "value", value: "tt9900001" }));

    expect(movie).toMatchObject({
      id: 9001,
      title: "El faro del norte",
      original_title: "The Northern Lighthouse",
      year: 2019,
      release_date: "2019-10-04",
      genres: ["Drama", "Ciencia ficción"],
      rating: 7.8,
      vote_count: 1520,
      poster: "https://image.tmdb.org/t/p/w500/faro-norte.jpg",
      imdb_id: "tt9900001",
      reference: { kind: "imdb", id: "tt9900001", url: "https://www.imdb.com/title/tt9900001/" },
      tmdb_url: "https://www.themoviedb.org/movie/9001"
    });
    expect(Object.values(movie?.field_status ?? {})).toEqual(Array(9).fill("present"));
  });

  it("keeps a movie without poster and marks the field as missing", () => {
    const movie = normalizeMovie({ ...completeDetails, poster_path: null }, context());

    expect(movie?.poster).toBeNull();
    expect(movie?.field_status.poster).toBe("missing");
  });

  it("distinguishes empty, missing and invalid poster paths", () => {
    expect(normalizeMovie({ ...completeDetails, poster_path: "" }, context())?.field_status.poster).toBe("empty");
    expect(normalizeMovie({ ...completeDetails, poster_path: "faro.jpg" }, context())?.poster).toBeNull();
    expect(normalizeMovie({ ...completeDetails, poster_path: 12 }, context())?.field_status.poster).toBe("invalid");
  });

  it("falls back to the TMDB reference when IMDb is absent or not requested", () => {
    const missing = normalizeMovie(completeDetails, context({ kind: "value", value: null }));
    const notRequested = normalizeMovie(completeDetails, context());
    const unavailable = normalizeMovie(completeDetails, context({ kind: "unavailable" }));

    expect(missing?.reference).toEqual({
      kind: "tmdb",
      id: "9001",
      url: "https://www.themoviedb.org/movie/9001"
    });
    expect(missing?.field_status.imdb_id).toBe("missing");
    expect(notRequested?.field_status.imdb_id).toBe("not_requested");
    expect(unavailable?.field_status.imdb_id).toBe("unavailable");
    expect(unavailable?.imdb_id).toBeNull();
  });

  it("never builds IMDb links from malformed identifiers", () => {
    const movie = normalizeMovie(completeDetails, context({ kind: "value", value: "nm0000001" }));

    expect(movie?.imdb_id).toBeNull();
    expect(movie?.field_status.imdb_id).toBe("invalid");
    expect(movie?.reference.kind).toBe("tmdb");
    expect(normalizeMovie(completeDetails, context({ kind: "value", value: "" }))?.field_status.imdb_id).toBe("empty");
  });

  it("represents an incomplete response with explicit nulls", () => {
    const movie = normalizeMovie(incompleteDetails, context());

    expect(movie).toMatchObject({
      id: 9005,
      title: null,
      year: null,
      overview: null,
      genres: [],
      rating: null,
      poster: null
    });
    expect(movie?.field_status).toMatchObject({
      title: "missing",
      release_date: "missing",
      genres: "missing",
      rating: "missing",
      vote_count: "missing"
    });
  });

  it("returns null only when the TMDB id is unusable", () => {
    expect(normalizeMovie({ title: "Sin id" }, context())).toBeNull();
    expect(normalizeMovie({ id: -4 }, context())).toBeNull();
    expect(normalizeMovie({ id: "9001" }, context())).toBeNull();
    expect(normalizeMovie(null, context())).toBeNull();
    expect(normalizeMovie([completeDetails], context())).toBeNull();
  });

  it("validates release dates instead of trusting their format", () => {
    const status = (value: unknown) =>
      normalizeMovie({ ...completeDetails, release_date: value }, context())?.field_status.release_date;

    expect(status("")).toBe("empty");
    expect(status("2019-02-30")).toBe("invalid");
    expect(status("04/10/2019")).toBe("invalid");
    expect(status(2019)).toBe("invalid");
  });

  it("treats a rating without votes as empty", () => {
    const [, , unrated] = ambiguousSearch.results;
    const movie = normalizeMovie(unrated, context());

    expect(movie?.rating).toBeNull();
    expect(movie?.field_status.rating).toBe("empty");
    expect(movie?.field_status.overview).toBe("empty");
    expect(normalizeMovie({ id: 1, vote_average: 0 }, context())?.field_status.rating).toBe("empty");
    expect(normalizeMovie({ id: 1, vote_average: 11, vote_count: 3 }, context())?.field_status.rating).toBe("invalid");
    expect(normalizeMovie({ id: 1, vote_count: -1 }, context())?.field_status.vote_count).toBe("invalid");
  });

  it("maps list genre ids and reports when the catalog is unavailable", () => {
    const [first] = ambiguousSearch.results;

    expect(normalizeMovie(first, context())?.genres).toEqual(["Terror"]);
    expect(normalizeMovie(first, context(undefined, { genresById: null }))?.field_status.genres).toBe("unavailable");
    expect(normalizeMovie({ id: 1, genre_ids: [] }, context())?.field_status.genres).toBe("empty");
    expect(normalizeMovie({ id: 1, genre_ids: [999] }, context())?.field_status.genres).toBe("unavailable");
    expect(normalizeMovie({ id: 1, genres: [] }, context())?.field_status.genres).toBe("empty");
    expect(normalizeMovie({ id: 1, genres: [{ id: 5 }] }, context())?.field_status.genres).toBe("invalid");
    expect(normalizeMovie({ id: 1, genres: null }, context())?.field_status.genres).toBe("missing");
    expect(normalizeMovie({ id: 1, genres: "Drama" }, context())?.field_status.genres).toBe("invalid");
  });

  it("keeps hostile overviews verbatim and labels them as untrusted data", () => {
    const movie = normalizeMovie(maliciousDetails, context({ kind: "value", value: "tt9900006" }));

    expect(movie?.overview).toBe(maliciousOverview);
    expect(movie?.provenance).toEqual({
      source: "tmdb",
      trust: "untrusted_external",
      untrusted_fields: ["title", "original_title", "overview", "genres"],
      suspected_instruction_fields: ["overview"]
    });
  });

  it("marks non-string text fields as invalid", () => {
    const movie = normalizeMovie({ id: 3, title: { text: "x" } }, context());

    expect(movie?.title).toBeNull();
    expect(movie?.field_status.title).toBe("invalid");
  });
});

describe("buildMovieReference", () => {
  it("builds TMDB or IMDb references", () => {
    expect(buildMovieReference(5, null).url).toBe("https://www.themoviedb.org/movie/5");
    expect(buildMovieReference(5, "tt1234567").url).toBe("https://www.imdb.com/title/tt1234567/");
  });
});
