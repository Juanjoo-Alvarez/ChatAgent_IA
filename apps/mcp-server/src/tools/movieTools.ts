import type { Movie, MovieField, TmdbClient } from "@agichat/tmdb";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { Logger } from "../logger.js";
import {
  UNTRUSTED_CONTENT_NOTICE,
  getMovieDetailsInput,
  getMovieDetailsOutput,
  recommendMoviesInput,
  recommendMoviesOutput,
  searchMoviesInput,
  searchMoviesOutput
} from "./movieSchemas.js";
import { toErrorPayload, toolErrorResult } from "./toolErrors.js";

/** Operaciones de catálogo que necesitan las herramientas; se inyecta el cliente. */
export type MovieCatalog = Pick<TmdbClient, "searchMovies" | "getMovieDetails" | "getMovieCandidates">;

export interface MovieToolsDependencies {
  readonly movies: MovieCatalog;
  readonly logger: Logger;
}

export const MOVIE_TOOL_NAMES = ["search_movies", "get_movie_details", "recommend_movies"] as const;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function success(structured: Record<string, unknown>): CallToolResult {
  return {
    structuredContent: structured,
    // Copia textual para clientes que no leen `structuredContent`.
    content: [{ type: "text", text: JSON.stringify(structured) }]
  };
}

function missingFields(movie: Movie): MovieField[] {
  return (Object.entries(movie.field_status) as [MovieField, string][])
    .filter(([, status]) => status !== "present")
    .map(([field]) => field);
}

async function run(
  logger: Logger,
  tool: string,
  args: Record<string, unknown>,
  operation: () => Promise<Record<string, unknown>>
): Promise<CallToolResult> {
  const startedAt = Date.now();
  try {
    const result = success(await operation());
    logger.info("tool_call", { tool, args, outcome: "ok", duration_ms: Date.now() - startedAt });
    return result;
  } catch (error) {
    const payload = toErrorPayload(error);
    logger.error("tool_call", {
      tool,
      args,
      outcome: "error",
      code: payload.error.code,
      duration_ms: Date.now() - startedAt,
      ...(payload.error.code === "internal_error" ? { cause: String(error) } : {})
    });
    return toolErrorResult(payload);
  }
}

export function registerMovieTools(server: McpServer, { movies, logger }: MovieToolsDependencies): void {
  server.registerTool(
    "search_movies",
    {
      title: "Buscar películas",
      description:
        "Busca películas en TMDB por título, con año, géneros y página opcionales. Devuelve películas normalizadas, " +
        "paginación e indicador de ambigüedad. No incluye IMDb: usa get_movie_details para obtenerlo. " +
        "Ejemplo: {\"query\": \"La casa\", \"year\": 2016}. " +
        UNTRUSTED_CONTENT_NOTICE,
      inputSchema: searchMoviesInput,
      outputSchema: searchMoviesOutput,
      annotations: READ_ONLY
    },
    (args) =>
      run(logger, "search_movies", args, async () => ({
        ...(await movies.searchMovies({
          query: args.query,
          year: args.year,
          genres: args.genres,
          page: args.page
        })),
        content_notice: UNTRUSTED_CONTENT_NOTICE
      }))
  );

  server.registerTool(
    "get_movie_details",
    {
      title: "Detalles de una película",
      description:
        "Recupera los detalles normalizados de una película por su ID de TMDB, incluido el identificador IMDb " +
        "cuando TMDB lo conoce, la mejor referencia disponible y los campos faltantes. " +
        "Ejemplo: {\"movie_id\": 27205}. " +
        UNTRUSTED_CONTENT_NOTICE,
      inputSchema: getMovieDetailsInput,
      outputSchema: getMovieDetailsOutput,
      annotations: READ_ONLY
    },
    (args) =>
      run(logger, "get_movie_details", args, async () => {
        const movie = await movies.getMovieDetails(args.movie_id);
        return { movie, missing_fields: missingFields(movie), content_notice: UNTRUSTED_CONTENT_NOTICE };
      })
  );

  server.registerTool(
    "recommend_movies",
    {
      title: "Candidatos de películas",
      description:
        "Obtiene candidatos de TMDB según preferencias: géneros, año o rango de años, valoración mínima, votos, " +
        "idioma original y orden. Son candidatos filtrados, no recomendaciones personalizadas definitivas: " +
        "evalúalos antes de recomendarlos. Ejemplo: {\"genres\": [\"Ciencia ficción\"], \"year_from\": 2010, \"min_rating\": 7}. " +
        UNTRUSTED_CONTENT_NOTICE,
      inputSchema: recommendMoviesInput,
      outputSchema: recommendMoviesOutput,
      annotations: READ_ONLY
    },
    (args) =>
      run(logger, "recommend_movies", args, async () => ({
        ...(await movies.getMovieCandidates({
          query: args.query,
          genres: args.genres,
          genreMatch: args.genre_match,
          year: args.year,
          yearFrom: args.year_from,
          yearTo: args.year_to,
          minRating: args.min_rating,
          minVoteCount: args.min_vote_count,
          sortBy: args.sort_by,
          originalLanguage: args.original_language,
          page: args.page
        })),
        content_notice: UNTRUSTED_CONTENT_NOTICE
      }))
  );
}
