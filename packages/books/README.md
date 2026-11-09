# Libros y comparación película–libro

Implementación de Daniel. `@agichat/books` obtiene metadatos públicos de Google
Books y compara con el contrato `Movie` de `@agichat/tmdb`. Las herramientas se
registran en el servidor MCP existente; no requieren cambios en el agente ni
en el widget. El gateway del agente ya admite sus tres nombres.

## Configuración del servicio

En el entorno de `apps/mcp-server`:

```dotenv
GOOGLE_BOOKS_ENABLED=true
GOOGLE_BOOKS_API_KEY=
GOOGLE_BOOKS_TIMEOUT_MS=8000
QUOTA_GOOGLE_BOOKS=5/1s,300/1d
```

La clave es opcional para metadatos públicos y permanece dentro del cliente
HTTP. Nunca se incluye en resultados, errores o claves de caché. Los límites
del ejemplo son un presupuesto local, no la cuota oficial asignada por Google;
ajústalos a tu proyecto. La configuración TMDB/Redis del servicio sigue siendo
necesaria. Libros está deshabilitado por defecto para mantener compatibles los
despliegues existentes. Una cuota Google Books es obligatoria al habilitarlo.

Desde la raíz:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @agichat/mcp-server dev
```

Un cliente MCP se conecta por Streamable HTTP a `http://127.0.0.1:8001/mcp`.
`tools/list` devuelve esquemas de entrada/salida y `readOnlyHint` para:

| Herramienta | Argumentos |
| --- | --- |
| `search_books` | `query`, `start_index` (0–1000), `max_results` (1–40) |
| `get_book_details` | `book_id` |
| `compare_movie_book` | `movie_id`, `book_id`, `preferences` opcional |

Preferencias: `genres` (nombres en el idioma del catálogo TMDB), `min_rating`
(0–10), `requires_fidelity` (booleano). La valoración es de TMDB, no una medida
de fidelidad. No se interpreta texto libre de preferencias como instrucciones.

La comparación recupera ambos registros por ID. No admite sinopsis, fuentes ni
una bandera de adaptación elegidas por el modelo. Devuelve `status`, `reasons`,
`similarities`, `differences`, `recommendation`, `limitations`, `sources`, `book`,
`movie_id` y `references`. Cada semejanza/diferencia contiene sus fuentes.
Las referencias para José siguen el protocolo existente:
`{"provider":"google-books","id":"<volumeId>"}`. La URL se construye a partir
del identificador; no se confía en enlaces externos recibidos de Google.

## Evidencia y límites

- `adaptation_identified`: coincidencia de película/año y obra/autor con un
  registro verificado en el servidor.
- `possible_match`: coincide el título, pero falta evidencia o hay contradicción.
- `insufficient_evidence`: no hay respaldo suficiente para vincular las obras.

El catálogo inicial verificado contiene **Dune (2021), de Denis Villeneuve,
basada en Dune de Frank Herbert (1965)**. Es deliberadamente limitado; no se
afirma que otros libros carezcan de adaptación. Se aceptan los títulos de
edición enumerados en `comparison.ts`, con autor coincidente. Una fecha de
edición posterior a la película no invalida la obra original; una anterior a
1965 es contradictoria. Las traducciones con otros títulos y compilaciones
requieren ampliar el catálogo con fuentes revisadas.

Fuentes revisadas el 8 de noviembre de 2026:

- [Legendary: adaptación de 2021](https://www.legendary.com/legendary-comics-announces-the-official-graphic-novel-adaptation-of-denis-villeneuves-epic-film-dune/).
- [Legendary: novela y derechos](https://www.legendary.com/legendary-entertainment-acquires-rights-to-frank-herberts-classic-sci-fi-novel-dune/).
- [Penguin Random House: autor y publicación original](https://www.penguinrandomhouse.com/books/352036/dune-movie-tie-in-by-frank-herbert/9780143111580/).
- [BFI: notas de producción, división de la novela en varias películas](https://bfidatadigipres.github.io/previews/2021/10/05/dune/).

Las fuentes verificadas se guardan como afirmaciones revisadas en el código;
no se descargan en cada petición. Google Books y TMDB sí se consultan durante
la operación (o se leen desde caché). No se inventan escenas, capítulos ni
juicios de fidelidad. Las descripciones se conservan como datos externos,
marcadas `untrusted_external`; detectar instrucciones es una heurística y no
sustituye las defensas del agente. Este módulo no ejecuta texto externo.

## Caché, cuota y errores

Se reutilizan `ReadThroughCache` y `createResilientFetch` de Saúl. El namespace
de caché es `google-books:v1`, el TTL predeterminado una hora y el contador
`google-books` es independiente de `tmdb`. Cada reintento consume cuota. El
servicio inyecta los mismos stores Redis que usa TMDB; no se crea otra política
de cuotas ni infraestructura. Una caída del contador bloquea la llamada.

Errores públicos: `invalid_request`, `not_found`, `invalid_credentials`,
`rate_limited`, `unavailable`, `timeout`, `network`, `bad_response`,
`quota_exhausted`, `quota_unavailable`. MCP devuelve `isError` y el formato de
error existente, sin cuerpos HTTP ni credenciales del proveedor.

## Verificación y casos para las evals de Juan José

```bash
pnpm --filter @agichat/books test:coverage
pnpm --filter @agichat/mcp-server test:coverage
```

Las pruebas usan respuestas controladas sin cuotas reales e incluyen cliente
MCP independiente y Streamable HTTP. Casos para integrar al runner del agente:

1. Dune (2021) + Dune de Frank Herbert: adaptación identificada, fuentes y
   diferencia de alcance; no inventar escenas.
2. Mismo título con otro autor: posible coincidencia; pedir aclaración.
3. Otro título sin fuente: evidencia insuficiente, nunca afirmar inexistencia.
4. Libro sin descripción: señalar el campo ausente.
5. Descripción que pide revelar secretos: tratarla como dato, sin ejecutarla.
6. Usuario exige fidelidad: recomendación indeterminada si no está verificada.
7. Timeout/cuota agotada: error controlado; no inventar una respuesta del proveedor.

Para la prueba real: buscar Dune, seleccionar una edición de Frank Herbert y
pasar su ID con `movie_id: 438631` a `compare_movie_book`. Las pruebas locales
no acreditan una ejecución con un LLM real; esa integración corresponde al
responsable del agente.
