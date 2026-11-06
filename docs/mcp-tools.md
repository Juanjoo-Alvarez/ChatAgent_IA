# Servidor MCP: herramientas de películas

`apps/mcp-server` es el **único servidor MCP del proyecto**. Expone las
herramientas mediante el transporte **Streamable HTTP** y puede consumirlo el
agente del sistema o cualquier cliente MCP compatible. Las integraciones
nuevas registran sus herramientas en este mismo servidor (ver
[Agregar herramientas](#agregar-herramientas)), así que no hay servidores
paralelos.

## Ejecución

```bash
docker compose up -d --wait redis
cp apps/mcp-server/.env.example apps/mcp-server/.env   # completar el token y QUOTA_TMDB
pnpm --filter @agichat/mcp-server build
pnpm --filter @agichat/mcp-server dev                    # lee apps/mcp-server/.env
```

Endpoint por defecto: `http://127.0.0.1:8001/mcp`. Salud: `GET /healthz`.

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `TMDB_READ_ACCESS_TOKEN` | Sí | Token de lectura (v4) de TMDB. Solo en variables de entorno. |
| `QUOTA_TMDB` | Sí | Límites con formato `cantidad/duración`, por ejemplo `5/1s,300/1d` (valores ficticios). Sin valor por defecto. |
| `SHARED_STORE` | No | `redis` (por defecto) o `memory` (una sola réplica). |
| `REDIS_URL` | Con `redis` | Redis compartido para cuotas y caché. |
| `TMDB_LANGUAGE` | No | Idioma de títulos, sinopsis y géneros. Por defecto `es-MX`. |
| `TMDB_TIMEOUT_MS` | No | Tiempo máximo por consulta. Por defecto 8000. |
| `MCP_HOST`, `MCP_PORT`, `MCP_PATH` | No | Por defecto `127.0.0.1`, `8001` y `/mcp`. |
| `MCP_ALLOWED_HOSTS` | No | Valores de `Host` aceptados (protección contra DNS rebinding). |

## Transporte

- **Streamable HTTP sin sesión.** Cada `POST /mcp` es independiente, por lo
  que cualquier réplica atiende cualquier solicitud sin afinidad de sesión.
  Cuotas y caché se comparten mediante Redis.
- Las respuestas son JSON (`enableJsonResponse`). `GET` y `DELETE` responden
  `405`, porque sin sesiones no hay flujo SSE que abrir ni sesión que cerrar.
- El cliente debe enviar `Accept: application/json, text/event-stream`, como
  indica la especificación. Los SDK oficiales lo hacen automáticamente.

### Cliente TypeScript

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "mi-cliente", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:8001/mcp")));

const { tools } = await client.listTools();
const result = await client.callTool({ name: "search_movies", arguments: { query: "Alien", year: 1979 } });
```

### Cliente Python (agentes del SDK de OpenAI)

```python
from agents.mcp import MCPServerStreamableHttp

movies = MCPServerStreamableHttp(params={"url": "http://127.0.0.1:8001/mcp"})
```

### Solicitud HTTP directa

```bash
curl -s http://127.0.0.1:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_movie_details","arguments":{"movie_id":550}}}'
```

## Herramientas

Las tres son de solo lectura (`readOnlyHint: true`) y declaran `inputSchema`
y `outputSchema`. Un cliente puede obtener los esquemas JSON completos con
`tools/list`. En una respuesta exitosa, `structuredContent` cumple
`outputSchema` y `content[0].text` contiene el mismo objeto serializado.

### `search_movies`

Busca por título.

| Parámetro | Tipo | Reglas |
| --- | --- | --- |
| `query` | string | Obligatorio, de 1 a 200 caracteres. |
| `year` | integer | Opcional, entre 1870 y 2100. Año de estreno principal. |
| `genres` | (string \| integer)[] | Opcional, hasta 20 elementos. Nombres en el idioma del servidor o IDs de TMDB. |
| `page` | integer | Opcional, entre 1 y 500. |

Salida: `query`, `results: Movie[]`, `page`, `total_pages`, `total_results`,
`skipped`, `ambiguous`, `exact_title_match_ids`, `filters_applied_locally`,
`content_notice`.

- `ambiguous: true` indica que hay varios resultados y ninguno coincide de
  forma única con el título. Conviene preguntar al usuario o pedir el año.
- La búsqueda de TMDB no filtra por género: el filtro se aplica sobre la página
  y queda indicado en `filters_applied_locally`.
- Los resultados traen `field_status.imdb_id = "not_requested"`. El
  identificador IMDb se obtiene con `get_movie_details`.

### `get_movie_details`

| Parámetro | Tipo | Reglas |
| --- | --- | --- |
| `movie_id` | integer | Obligatorio, positivo. ID de TMDB. |

Salida: `movie: Movie`, `missing_fields` (campos cuyo estado no es `present`)
y `content_notice`.

### `recommend_movies`

Obtiene **candidatos** filtrados. No son recomendaciones personalizadas
definitivas: el agente debe evaluarlos antes de recomendarlos.

| Parámetro | Tipo | Reglas |
| --- | --- | --- |
| `query` | string | Opcional. Si existe, se busca por título y los demás filtros se aplican sobre la página. |
| `genres` | (string \| integer)[] | Opcional. |
| `genre_match` | `any` \| `all` | Opcional, por defecto `any`. |
| `year` | integer | Opcional. No se combina con `year_from` ni `year_to`. |
| `year_from`, `year_to` | integer | Opcionales, con `year_from` ≤ `year_to`. |
| `min_rating` | number | Opcional, entre 0 y 10. |
| `min_vote_count` | integer | Opcional, ≥ 0. Con `min_rating` y sin este valor se usa 50. |
| `sort_by` | enum | `popularity.desc` (por defecto), `popularity.asc`, `vote_average.desc`, `vote_average.asc`, `vote_count.desc`, `primary_release_date.desc`, `primary_release_date.asc`. |
| `original_language` | string | Opcional, ISO 639-1 (`es`, `ja`). |
| `page` | integer | Opcional, entre 1 y 500. |

Salida: `kind: "candidates"`, `strategy` (`search` o `discover`),
`candidates: Movie[]`, paginación, `applied_filters`,
`filters_applied_locally`, `ignored_filters`, `disclaimer` y
`content_notice`.

Con `query` la estrategia es `search`: `sort_by` y `original_language` no se
pueden aplicar y aparecen en `ignored_filters`.

## Contrato `Movie`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | integer | ID de TMDB, siempre presente. |
| `title`, `original_title` | string \| null | |
| `year` | integer \| null | Derivado de `release_date`. |
| `release_date` | string \| null | `YYYY-MM-DD`, validada. |
| `overview` | string \| null | Contenido externo no confiable. |
| `genres` | string[] | Nombres en el idioma del servidor. |
| `rating` | number \| null | Promedio de TMDB (0 a 10). `null` si no hay votos. |
| `vote_count` | integer \| null | |
| `poster` | string \| null | URL completa. Solo se construye si TMDB entregó una ruta. |
| `imdb_id` | string \| null | `tt` seguido de dígitos, solo si TMDB lo entrega. Nunca se infiere. |
| `reference` | `{ kind, id, url }` | `imdb` si hay identificador válido; si no, `tmdb`. |
| `tmdb_url` | string | Ficha de TMDB, siempre disponible. |
| `field_status` | objeto | Estado de cada campo (tabla siguiente). |
| `provenance` | objeto | `{ source: "tmdb", trust: "untrusted_external", untrusted_fields, suspected_instruction_fields }`. |

| Estado | Significado |
| --- | --- |
| `present` | Valor válido. |
| `empty` | TMDB lo entregó vacío (cadena vacía, lista vacía o valoración sin votos). |
| `missing` | El campo no existe o vino como `null`. |
| `invalid` | Existe, pero con un formato inutilizable (no se corrige ni se inventa). |
| `not_requested` | La operación no lo consulta. |
| `unavailable` | Se intentó recuperar y falló. |

## Errores

Un error de herramienta llega como `isError: true`, **sin**
`structuredContent` (los clientes validan ese campo contra el esquema de
éxito). El texto contiene un JSON:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "TMDB limitó temporalmente las solicitudes. Intenta más tarde.",
    "retryable": true,
    "retry_after_ms": 2000,
    "details": null
  }
}
```

| `code` | `retryable` | Causa |
| --- | --- | --- |
| `invalid_request` | No | Parámetros que TMDB no acepta o géneros desconocidos (`details.available_genres` lista los válidos). |
| `not_found` | No | No existe una película con ese ID. |
| `invalid_credentials` | No | Token ausente o inválido en el servidor. |
| `rate_limited` | Sí | TMDB respondió 429 (ya se reintentó automáticamente). |
| `unavailable` | Sí | TMDB respondió 5xx. |
| `timeout` | Sí | TMDB no respondió a tiempo. |
| `network` | Sí | No se pudo conectar. |
| `unexpected_status` | No | Otro estado HTTP. |
| `bad_response` | No | Respuesta que no se pudo procesar. |
| `quota_exhausted` | No | Se alcanzó `QUOTA_TMDB`. `retry_after_ms` indica cuándo habrá cupo. |
| `quota_unavailable` | No | No se pudo consultar Redis; la solicitud no se envió. |
| `internal_error` | No | Error inesperado. El detalle solo se registra en los logs. |

Los argumentos que no cumplen `inputSchema` son rechazados por el SDK antes de
ejecutar la herramienta. También llegan como `isError: true`, con un texto que
empieza por `Input validation error`.

## Contenido externo no confiable

Títulos, sinopsis y géneros provienen de TMDB y pueden contener texto
malicioso, por ejemplo una sinopsis que pide ignorar instrucciones.

- Se entregan sin modificar su texto visible y solo dentro de campos de
  datos, nunca como parte de las instrucciones del servidor ni de las
  descripciones de herramientas.
- Se eliminan caracteres invisibles que pueden ocultar texto (controles,
  overrides bidireccionales, espacios de ancho cero, "tag characters").
- `provenance.suspected_instruction_fields` señala, mediante una heurística,
  los campos que parecen instrucciones. No elimina contenido; ver
  [evaluation-scenarios.md](./evaluation-scenarios.md).
- Cada película declara `provenance.trust = "untrusted_external"` y cada
  respuesta incluye `content_notice`.
- El agente debe mostrarlos como información de la película y no ejecutar
  acciones basadas en ellos.

## Agregar herramientas

Cada integración expone una función `register<Integración>Tools(server, deps)`
y se registra en `createMcpServer` (`apps/mcp-server/src/server.ts`). Así todas
las herramientas comparten el mismo endpoint, transporte, logs y política de
cuotas ([quota-policy.md](./quota-policy.md)).
