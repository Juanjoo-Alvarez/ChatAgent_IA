// Contrato de datos normalizado. Los nombres en snake_case son los que viajan
// por MCP, de modo que los consumidores no necesitan conocer el formato de TMDB.

/**
 * Estado de cada campo de una película:
 * - `present`: TMDB entregó un valor válido.
 * - `empty`: TMDB entregó el campo vacío (cadena vacía, lista vacía o
 *   valoración sin votos).
 * - `missing`: el campo no existe o vino como `null` en la respuesta.
 * - `invalid`: el campo existe, pero con un formato inutilizable.
 * - `not_requested`: la operación no consulta ese dato (por ejemplo, IMDb en
 *   búsquedas); se obtiene con los detalles de la película.
 * - `unavailable`: se intentó recuperar el dato y la consulta falló.
 */
export type FieldStatus =
  | "present"
  | "empty"
  | "missing"
  | "invalid"
  | "not_requested"
  | "unavailable";

export type MovieField =
  | "title"
  | "original_title"
  | "release_date"
  | "overview"
  | "genres"
  | "rating"
  | "vote_count"
  | "poster"
  | "imdb_id";

export interface MovieReference {
  /** `imdb` solo cuando TMDB entregó un identificador IMDb válido. */
  readonly kind: "imdb" | "tmdb";
  readonly id: string;
  readonly url: string;
}

export interface MovieProvenance {
  readonly source: "tmdb";
  /** Los metadatos son contenido externo: deben mostrarse, nunca obedecerse. */
  readonly trust: "untrusted_external";
  readonly untrusted_fields: readonly MovieField[];
}

export interface Movie {
  /** Identificador de TMDB; siempre presente y válido para consultas posteriores. */
  readonly id: number;
  readonly title: string | null;
  readonly original_title: string | null;
  readonly year: number | null;
  /** Fecha de estreno principal en formato `YYYY-MM-DD`. */
  readonly release_date: string | null;
  readonly overview: string | null;
  readonly genres: readonly string[];
  /** Valoración promedio de TMDB en escala 0-10. */
  readonly rating: number | null;
  readonly vote_count: number | null;
  /** URL completa del póster, construida solo si TMDB entregó una ruta. */
  readonly poster: string | null;
  readonly imdb_id: string | null;
  /** Mejor referencia disponible: IMDb si existe; si no, la ficha de TMDB. */
  readonly reference: MovieReference;
  readonly tmdb_url: string;
  readonly field_status: Readonly<Record<MovieField, FieldStatus>>;
  readonly provenance: MovieProvenance;
}

export interface MoviePage {
  readonly results: readonly Movie[];
  readonly page: number;
  /** `null` cuando TMDB no informó la paginación. */
  readonly total_pages: number | null;
  readonly total_results: number | null;
  /** Registros descartados por no tener un identificador de TMDB válido. */
  readonly skipped: number;
}

export interface MovieSearchResult extends MoviePage {
  readonly query: string;
  /** IDs cuyo título (o título original) coincide exactamente con la búsqueda. */
  readonly exact_title_match_ids: readonly number[];
  /** Verdadero si hay varios resultados y ninguno se identifica de forma única. */
  readonly ambiguous: boolean;
  /** Filtros que TMDB no admite en búsqueda y se aplicaron sobre la página. */
  readonly filters_applied_locally: readonly string[];
}

export interface Genre {
  readonly id: number;
  readonly name: string;
}

/** Un género puede indicarse por nombre (en el idioma configurado) o por ID. */
export type GenreInput = string | number;

export type GenreMatch = "any" | "all";

export const SORT_OPTIONS = [
  "popularity.desc",
  "popularity.asc",
  "vote_average.desc",
  "vote_average.asc",
  "vote_count.desc",
  "primary_release_date.desc",
  "primary_release_date.asc"
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export interface SearchMoviesParams {
  readonly query: string;
  readonly year?: number | undefined;
  readonly genres?: readonly GenreInput[] | undefined;
  readonly page?: number | undefined;
}

export interface DiscoverMoviesParams {
  readonly genres?: readonly GenreInput[] | undefined;
  readonly genreMatch?: GenreMatch | undefined;
  readonly year?: number | undefined;
  readonly yearFrom?: number | undefined;
  readonly yearTo?: number | undefined;
  readonly minRating?: number | undefined;
  readonly minVoteCount?: number | undefined;
  readonly sortBy?: SortOption | undefined;
  /** Código ISO 639-1, por ejemplo `es` o `ja`. */
  readonly originalLanguage?: string | undefined;
  readonly page?: number | undefined;
}

export interface CandidateCriteria extends DiscoverMoviesParams {
  readonly query?: string | undefined;
}

export interface AppliedFilters {
  readonly query: string | null;
  readonly genres: readonly string[];
  readonly genre_match: GenreMatch;
  readonly year: number | null;
  readonly year_from: number | null;
  readonly year_to: number | null;
  readonly min_rating: number | null;
  readonly min_vote_count: number | null;
  readonly sort_by: SortOption | null;
  readonly original_language: string | null;
}

export interface CandidateResult {
  readonly kind: "candidates";
  /** `search` si hubo término de búsqueda; `discover` si solo hubo filtros. */
  readonly strategy: "search" | "discover";
  readonly candidates: readonly Movie[];
  readonly page: number;
  readonly total_pages: number | null;
  readonly total_results: number | null;
  readonly skipped: number;
  readonly applied_filters: AppliedFilters;
  readonly filters_applied_locally: readonly string[];
  /** Criterios recibidos que la estrategia elegida no puede aplicar. */
  readonly ignored_filters: readonly string[];
  readonly disclaimer: string;
}

export interface ExternalIdsResult {
  readonly id: number;
  readonly imdb_id: string | null;
  readonly imdb_status: FieldStatus;
}
