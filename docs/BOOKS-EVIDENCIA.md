# Entrega de Daniel: libros y comparación

## Resultado real del 17 de noviembre de 2026

Se verificó el acceso autenticado a Google Books y se completó la comparación
de **Dune (2021)** con **Dune de Frank Herbert** usando los clientes de producción.
El [reporte JSON](evidence/books-live-2026-11-17.json) conserva los resultados
y los tiempos reales, sin credenciales ni cuerpos completos de los proveedores.

| Comprobación | Resultado |
| --- | --- |
| Búsqueda bibliográfica | Google Books HTTP 200 |
| Detalle del volumen `q_5WzQEACAAJ` | HTTP 200, Frank Herbert, descripción presente |
| Película TMDB `438631` | HTTP 200, Duna, 2021, IMDb `tt1160419` |
| Asociación y comparación | `adaptation_identified`, semejanza y diferencia con fuentes |
| Segunda consulta del libro | Resuelta desde caché, sin nueva llamada externa |
| Cliente MCP independiente | Descubrimiento y ejecución de las tres herramientas por Streamable HTTP |

El cliente MCP utiliza la caché poblada por las consultas reales de esa misma
ejecución. No se usan fixtures para este reporte. El servidor temporal escucha
únicamente en localhost y se cierra al terminar.

## Revisión de la comparación

La asociación no depende solo del título: valida película/año, obra y autor
contra un catálogo de fuentes revisadas. El anuncio de
[Legendary de octubre de 2021](https://www.legendary.com/legendary-comics-announces-the-official-graphic-novel-adaptation-of-denis-villeneuves-epic-film-dune/)
identifica la película de Villeneuve como adaptación de la novela de Herbert.
Las [notas de producción publicadas por BFI](https://bfidatadigipres.github.io/previews/2021/10/05/dune/)
describen a Paul Atreides y Arrakis y explican la decisión de dividir la novela
en más de una película. Ambas páginas se volvieron a consultar el 17/11/2026.

La respuesta comprobada recomienda considerar la película como interpretación
cinematográfica; advierte que esta entrega no cubre toda la novela. No afirma
fidelidad escena por escena ni inventa capítulos. Con `requires_fidelity: true`
el módulo devuelve una recomendación indeterminada, como verifican las pruebas.
La revisión grupal del PR permanece pendiente; esta comprobación no la sustituye.

## Matriz del alcance de Daniel

| Requisito | Implementación | Evidencia |
| --- | --- | --- |
| Buscar libros y obtener detalles públicos | `packages/books/src/GoogleBooksClient.ts` | Reporte real: búsqueda y detalle |
| Herramientas MCP reutilizables | `apps/mcp-server/src/tools/bookTools.ts` | Cliente independiente real y `bookTools.test.ts` |
| Asociación con autores, fechas y fuentes | `packages/books/src/comparison.ts` | Dune real y `comparison.test.ts` |
| Tres estados de incertidumbre | `comparison.ts` | Casos de autor distinto, título desconocido y fecha contradictoria |
| Comparación según preferencias | `comparison.ts` | Género, valoración y fidelidad en `comparison.test.ts` |
| Evitar afirmaciones inventadas | Catálogo documentado y limitaciones explícitas | Fuentes anteriores; pruebas de evidencia insuficiente |
| Caché y cuotas reutilizadas | `@agichat/external-api`, namespace y contador `google-books` | `books.test.ts`: caché compartida, reintentos contados y cuota TMDB separada |
| Fallos externos controlados | Errores tipados y traducción MCP | HTTP 401/403/404/429/500, timeout, red, cuota agotada y contador caído |
| Casos adversariales | Metadatos `untrusted_external`, schemas estrictos | Libro sin descripción, ambigüedad, texto malicioso y evidencia/URL aportada por el modelo |

Los errores y límites se prueban con respuestas controladas para no agotar
deliberadamente cuotas reales. Los HTTP 200 del reporte verifican el acceso
real; no se presentan como evidencia de un fallo real de Google.

## Reproducción

Validación local de esta entrega: `pnpm lint`, `pnpm build`, `pnpm typecheck`
y `pnpm test:coverage` completados correctamente. La suite registró 604 pruebas
aprobadas y 6 pruebas opcionales de Redis omitidas por no disponer de la
configuración de integración Redis. Estas últimas corresponden a la validación
de infraestructura y no se contabilizan como aprobadas.

| Paquete | Pruebas | Líneas | Ramas | Funciones |
| --- | --- | --- | --- | --- |
| `@agichat/books` | 20 aprobadas | 100% | 98.31% | 100% |
| `@agichat/mcp-server` | 70 aprobadas | 98.59% | 95.62% | 93.93% |

Las pruebas de servidor requieren permiso para escuchar en localhost. Un primer
intento en un entorno que bloqueaba puertos falló con `listen EPERM`; al
ejecutarlas con ese permiso, la suite terminó correctamente sin cambiar los
timeouts ni el código de los compañeros.

Configurar `apps/mcp-server/.env` localmente con `GOOGLE_BOOKS_ENABLED=true`,
`GOOGLE_BOOKS_API_KEY`, `TMDB_READ_ACCESS_TOKEN` y cuotas separadas. Seguir el
[manual del paquete](../packages/books/README.md). No versionar ese archivo.

```bash
pnpm --filter @agichat/mcp-server... build
RUN_LIVE_BOOKS=1 pnpm --filter @agichat/mcp-server evidence:books:live
pnpm --filter @agichat/books test:coverage
pnpm --filter @agichat/mcp-server test:coverage
```

Cada ejecución genera un nuevo reporte local en `evals/results`. El JSON de
esta entrega es una instantánea revisable, no una promesa de disponibilidad
futura de las APIs. La cuota del diagnóstico es acotada y los reintentos están
desactivados. No ejecutarlo en paralelo con pruebas de carga.

## Límites y entrega al grupo

El catálogo de adaptaciones verificadas cubre Dune (2021); otros casos pueden
devolver coincidencia posible o evidencia insuficiente. La ausencia de una
asociación no demuestra que no exista adaptación. Se deben revisar fuentes
antes de ampliar el catálogo.

El reporte valida el módulo y el transporte MCP. No acredita una conversación
con un LLM real, apertura de referencias en el navegador ni despliegue con dos
réplicas; esas verificaciones pertenecen al backend, widget e infraestructura.
Juan José puede invocar `compare_movie_book` con
`{"movie_id":438631,"book_id":"q_5WzQEACAAJ"}`; José recibe la referencia
`{"provider":"google-books","id":"q_5WzQEACAAJ"}` para el cliente.
