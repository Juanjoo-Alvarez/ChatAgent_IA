# Manual del servidor MCP

`apps/mcp-server` es el **único servidor MCP del proyecto** (`agichat-tools`,
versión 0.2.1). Expone 6 herramientas de solo lectura de películas y libros
mediante el transporte **Streamable HTTP**. Lo consume el agente de AGIChat y
puede consumirlo cualquier cliente MCP compatible.

Revisado contra el código del commit `ccd40d9` y con el servidor en ejecución
el 17 de noviembre de 2026.

## Ejecución

```powershell
docker compose up -d --wait redis
pnpm dev:mcp
```

`pnpm dev:mcp` compila las dependencias y lee `apps/mcp-server/.env`. Las
variables están en [CONFIGURACION.md](./CONFIGURACION.md#servidor-mcp-appsmcp-server).

| Elemento | Valor |
| --- | --- |
| Endpoint | `http://127.0.0.1:8001/mcp` |
| Salud | `GET /healthz` devuelve `{"status":"ok"}` |
| Transporte | Streamable HTTP sin sesión, respuestas JSON |
| Métodos aceptados en `/mcp` | Solo `POST`; `GET` y `DELETE` responden 405 |

## Transporte

- **Sin sesión.** Cada `POST /mcp` crea una instancia de servidor y es
  independiente. Cualquier réplica atiende cualquier solicitud sin afinidad.
- Las respuestas son JSON (`enableJsonResponse`). Sin sesiones no hay flujo SSE
  que abrir ni sesión que cerrar.
- El cliente debe enviar `Accept: application/json, text/event-stream`, como
  indica la especificación. Los SDK oficiales lo hacen automáticamente.
- Si `MCP_ALLOWED_HOSTS` tiene valores, se rechazan cabeceras `Host` fuera de la
  lista (protección contra DNS rebinding).
- Los logs son JSON por `stderr` y no incluyen credenciales.

## Herramientas

Todas declaran `readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true` y `openWorldHint: true`, además de `inputSchema` y
`outputSchema`. En una respuesta exitosa, `structuredContent` cumple
`outputSchema` y `content[0].text` contiene el mismo objeto serializado. Los
esquemas JSON completos se obtienen con `tools/list`.

Las herramientas de libros solo existen con `GOOGLE_BOOKS_ENABLED=true`.

| Herramienta | Propósito | Entradas | Salida principal |
| --- | --- | --- | --- |
| `search_movies` | Buscar por título | `query`, `year`, `genres`, `page` | `results: Movie[]`, `ambiguous` |
| `get_movie_details` | Detalles e IMDb | `movie_id` | `movie: Movie`, `missing_fields` |
| `recommend_movies` | Candidatos filtrados | `query`, `genres`, `genre_match`, `year`, `year_from`, `year_to`, `min_rating`, `min_vote_count`, `sort_by`, `original_language`, `page` | `candidates: Movie[]`, `applied_filters` |
| `search_books` | Buscar libros candidatos | `query`, `start_index`, `max_results` | `results: Book[]`, `references` |
| `get_book_details` | Detalles de un libro | `book_id` | `book: Book`, `references` |
| `compare_movie_book` | Comparar película y libro | `movie_id`, `book_id`, `preferences` | `status`, `recommendation`, `similarities`, `differences`, `sources` |

### `search_movies`

| Parámetro | Tipo | Reglas |
| --- | --- | --- |
| `query` | string | Obligatorio, de 1 a 200 caracteres |
| `year` | integer | Opcional, entre 1870 y 2100 |
| `genres` | (string \| integer)[] | Opcional, hasta 20. Nombres en el idioma del servidor o IDs de TMDB |
| `page` | integer | Opcional, entre 1 y 500 |

Salida: `query`, `results`, `page`, `total_pages`, `total_results`, `skipped`,
`ambiguous`, `exact_title_match_ids`, `filters_applied_locally` y
`content_notice`.

- `ambiguous: true` indica varios resultados sin una coincidencia única con el
  título. Conviene preguntar al usuario o pedir el año.
- La búsqueda de TMDB no filtra por género. El filtro se aplica sobre la página y
  queda en `filters_applied_locally`.
- Los resultados traen `field_status.imdb_id = "not_requested"`. El
  identificador IMDb se obtiene con `get_movie_details`.

Ejemplo: `{ "query": "Dune", "year": 2021 }`.

### `get_movie_details`

| Parámetro | Tipo | Reglas |
| --- | --- | --- |
| `movie_id` | integer | Obligatorio, positivo. ID de TMDB |

Salida: `movie`, `missing_fields` (campos cuyo estado no es `present`) y
`content_notice`.

Ejemplo: `{ "movie_id": 438631 }`.

### `recommend_movies`

Devuelve **candidatos**, no recomendaciones definitivas. El agente los evalúa
antes de recomendarlos.

| Parámetro | Tipo | Reglas |
| --- | --- | --- |
| `query` | string | Opcional. Con `query`, se busca por título y los demás filtros se aplican sobre la página |
| `genres` | (string \| integer)[] | Opcional |
| `genre_match` | `any` \| `all` | Opcional, `any` por defecto |
| `year` | integer | Opcional. No se combina con `year_from` ni `year_to` |
| `year_from`, `year_to` | integer | Opcionales, con `year_from` ≤ `year_to` |
| `min_rating` | number | Opcional, de 0 a 10 |
| `min_vote_count` | integer | Opcional, ≥ 0. Con `min_rating` y sin este valor se usa 50 |
| `sort_by` | enum | `popularity.desc` (por defecto), `popularity.asc`, `vote_average.desc`, `vote_average.asc`, `vote_count.desc`, `primary_release_date.desc`, `primary_release_date.asc` |
| `original_language` | string | Opcional, ISO 639-1 de dos letras (`es`, `ja`) |
| `page` | integer | Opcional, entre 1 y 500 |

Salida: `kind: "candidates"`, `strategy` (`search` o `discover`), `candidates`,
paginación, `applied_filters`, `filters_applied_locally`, `ignored_filters`,
`disclaimer` y `content_notice`. Con `query` la estrategia es `search`, y
`sort_by` y `original_language` quedan en `ignored_filters`.

Ejemplo: `{ "genres": ["Drama"], "min_rating": 7.5, "sort_by": "vote_count.desc" }`.

### `search_books`

| Parámetro | Tipo | Reglas |
| --- | --- | --- |
| `query` | string | Obligatorio, de 1 a 300 caracteres |
| `start_index` | integer | Opcional, de 0 a 1000; 0 por defecto |
| `max_results` | integer | Opcional, de 1 a 40; 10 por defecto |

Salida: `results`, `total_items`, `start_index`, `skipped`, `ambiguous`,
`references` y `content_notice`. Los resultados son candidatos, no adaptaciones
confirmadas.

Ejemplo: `{ "query": "Dune Frank Herbert", "max_results": 5 }`.

### `get_book_details`

| Parámetro | Tipo | Reglas |
| --- | --- | --- |
| `book_id` | string | Obligatorio, `[A-Za-z0-9_-]{1,128}` |

Salida: `book`, `references` (la referencia `google-books` del volumen) y
`content_notice`.

### `compare_movie_book`

| Parámetro | Tipo | Reglas |
| --- | --- | --- |
| `movie_id` | integer | Obligatorio. ID de TMDB |
| `book_id` | string | Obligatorio. ID de Google Books |
| `preferences.genres` | string[] | Opcional, hasta 10 |
| `preferences.min_rating` | number | Opcional, de 0 a 10. Es la valoración de TMDB, no una medida de fidelidad |
| `preferences.requires_fidelity` | boolean | Opcional, `false` por defecto |

La herramienta recupera ambos registros por ID. **No acepta sinopsis, fuentes ni
una bandera de adaptación aportadas por el modelo.**

| `status` | Significado |
| --- | --- |
| `adaptation_identified` | La película, el año, el título del libro y el autor coinciden con un registro revisado en el servidor |
| `possible_match` | Coincide el título, pero falta evidencia |
| `insufficient_evidence` | No hay respaldo para vincular las obras |

| `recommendation.verdict` | Cuándo |
| --- | --- |
| `consider` | Adaptación identificada y sin conflicto con las preferencias |
| `not_recommended` | La valoración de TMDB es menor que `min_rating` |
| `undetermined` | No hay adaptación confirmada, se exige fidelidad o faltan datos |

El registro revisado (`VERIFIED_ADAPTATIONS`) contiene **solo Dune (2021), basada
en Dune de Frank Herbert**. Cada semejanza y diferencia incluye sus fuentes.

Ejemplo verificado: `{ "movie_id": 438631, "book_id": "JhJ7cgAACAAJ" }`
devolvió `status: "adaptation_identified"` y `verdict: "consider"`.

## Contratos de datos

### `Movie`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | integer | ID de TMDB, siempre presente |
| `title`, `original_title` | string \| null | |
| `year` | integer \| null | Derivado de `release_date` |
| `release_date` | string \| null | `YYYY-MM-DD` validada |
| `overview` | string \| null | Contenido externo no confiable |
| `genres` | string[] | En el idioma del servidor (`es-MX` por defecto) |
| `rating` | number \| null | Promedio de TMDB, de 0 a 10; `null` sin votos |
| `vote_count` | integer \| null | |
| `poster` | string \| null | URL completa; solo si TMDB entregó una ruta |
| `imdb_id` | string \| null | `tt` y dígitos, solo si TMDB lo entrega; nunca se infiere |
| `reference` | `{ kind, id, url }` | `imdb` si hay identificador; si no, `tmdb` |
| `tmdb_url` | string | Ficha de TMDB |
| `field_status` | objeto | Estado de cada campo: `present`, `empty`, `missing`, `invalid`, `not_requested` o `unavailable` |
| `provenance` | objeto | `source: "tmdb"`, `trust: "untrusted_external"`, `untrusted_fields`, `suspected_instruction_fields` |

### `Book`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string | ID del volumen de Google Books |
| `title` | string \| null | Hasta 500 caracteres |
| `authors` | string[] | Hasta 30 |
| `description` | string \| null | Contenido externo no confiable |
| `published_date` | string \| null | Fecha de la **edición**, no necesariamente de la obra original |
| `identifiers` | `{ type, identifier }[]` | ISBN y otros |
| `reference` | `{ provider: "google-books", id }` | Para abrir la página desde el widget |
| `url` | string | `https://books.google.com/books?id=<id>` |
| `provenance` | objeto | `source: "google-books"`, `trust: "untrusted_external"`, `suspected_instructions` |

## Errores

Un error llega como `isError: true`, **sin** `structuredContent` (los clientes
validan ese campo contra el esquema de éxito). El texto contiene un JSON:

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

| `code` | Reintentable | Causa |
| --- | --- | --- |
| `invalid_request` | No | Parámetros no válidos o géneros desconocidos (`details.available_genres` lista los válidos) |
| `not_found` | No | No existe el registro con ese ID |
| `invalid_credentials` | No | Token o clave ausentes o inválidos en el servidor |
| `rate_limited` | Sí | El proveedor respondió 429 (ya se reintentó) |
| `unavailable` | Sí | El proveedor respondió 5xx |
| `timeout` | Sí | El proveedor no respondió a tiempo |
| `network` | Sí | No se pudo conectar |
| `unexpected_status` | No | Otro estado HTTP |
| `bad_response` | No | Respuesta que no se pudo procesar |
| `quota_exhausted` | No | Se alcanzó `QUOTA_TMDB` o `QUOTA_GOOGLE_BOOKS`; `retry_after_ms` indica cuándo habrá cupo |
| `quota_unavailable` | No | No se pudo consultar Redis; la solicitud no se envió |
| `internal_error` | No | Error inesperado; el detalle solo va a los logs |

En las herramientas de libros, `message` es siempre «No se pudo completar la
consulta de Google Books.» y `retry_after_ms` es `null`. Los argumentos que no
cumplen `inputSchema` se rechazan antes de ejecutar la herramienta, con un texto
que empieza por `Input validation error`.

`rate_limited` y `quota_exhausted` son distintos. El primero lo decide el
proveedor y el segundo lo decide el presupuesto del proyecto.

## Contenido externo no confiable

Títulos, sinopsis, autores y descripciones pueden contener texto malicioso, por
ejemplo una sinopsis que pide ignorar instrucciones.

- Se entregan solo dentro de campos de datos, nunca en las instrucciones del
  servidor ni en las descripciones de las herramientas.
- Se eliminan caracteres invisibles que pueden ocultar texto (controles,
  overrides bidireccionales, espacios de ancho cero y *tag characters*).
- `suspected_instruction_fields` (películas) y `suspected_instructions`
  (libros) señalan con una heurística el texto que parece una instrucción. No
  eliminan contenido.
- Cada registro declara `trust: "untrusted_external"` y cada respuesta incluye
  `content_notice`.
- El agente vuelve a marcar cada resultado como `untrusted_external` antes de
  pasarlo al modelo (ver [AGENTE.md](../arquitectura/AGENTE.md)).

## Consumo desde otros clientes

### Cliente TypeScript

Verificado el 17 de noviembre de 2026 con `@modelcontextprotocol/sdk` 1.32.2
contra el servidor en ejecución.

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "mi-cliente", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:8001/mcp")));

const { tools } = await client.listTools();
const movies = await client.callTool({ name: "search_movies", arguments: { query: "Dune", year: 2021 } });
const books = await client.callTool({ name: "search_books", arguments: { query: "Dune Frank Herbert", max_results: 5 } });
const comparison = await client.callTool({
  name: "compare_movie_book",
  arguments: { movie_id: 438631, book_id: "JhJ7cgAACAAJ" }
});
await client.close();
```

### Cliente Python

Usa el SDK oficial de MCP para Python (`pip install mcp`).

**Pendiente:** este ejemplo no se ejecutó durante la preparación de la entrega.
Verifícalo con el servidor en marcha antes de citarlo como probado.

```python
import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def main():
    async with streamablehttp_client("http://127.0.0.1:8001/mcp") as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            result = await session.call_tool("search_movies", {"query": "Alien", "year": 1979})
            print([tool.name for tool in tools.tools], result.structuredContent)

asyncio.run(main())
```

### Solicitud HTTP directa

Verificada el 17 de noviembre de 2026.

```bash
curl -s http://127.0.0.1:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

```bash
curl -s http://127.0.0.1:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_movie_details","arguments":{"movie_id":438631}}}'
```

En PowerShell usa `curl.exe` en lugar de `curl`, porque `curl` es un alias de
`Invoke-WebRequest`.

## Agregar una herramienta

1. Crea o amplía una función `register<Integración>Tools(server, deps)` en
   `apps/mcp-server/src/tools/`, siguiendo `registerMovieTools` y
   `registerBookTools`.
2. Declara `inputSchema` y `outputSchema` con zod, y las anotaciones con
   `readOnlyHint: true` si la herramienta solo lee.
3. Devuelve `structuredContent` y `content` con el mismo objeto, y usa
   `toolErrorResult` para los errores, sin incluir secretos.
4. Reutiliza `QuotaManager`, la caché y `createResilientFetch` de
   `@agichat/external-api`, con un proveedor y una variable `QUOTA_<PROVEEDOR>`
   propios (ver [CACHE-Y-CUOTAS.md](../arquitectura/CACHE-Y-CUOTAS.md)).
5. Regístrala en `createMcpServer` (`apps/mcp-server/src/server.ts`).
6. **Para que el agente la use**, agrégala a la lista permitida `descriptions`
   de `packages/agent/src/McpGateway.ts`. El gateway ignora cualquier
   herramienta que no esté en esa lista o que no tenga `readOnlyHint=true`.
7. Si devuelve referencias navegables, inclúyelas en un campo `references` con
   el formato de `referenceSchema` de `@agichat/protocol`.
8. Agrega pruebas en `apps/mcp-server/tests/` y, si cambia el comportamiento del
   agente, casos en `evals/agent-cases.json`.
