# Conversaciones y comparaciones generales

El agente recomienda desde TMDB. Las comparaciones ya no dependen únicamente
de una lista manual: `compare_movie_book` acepta `movie_id` y un `book_id`
opcional. Al omitir el libro, el servidor MCP recupera la película, consulta su
obra de origen en Wikidata por ID TMDB (P4947), asociación (P144) y autor (P50),
y busca una edición con título y autor coincidentes en Google Books. Las
asociaciones revisadas previamente se reutilizan sin consultar Wikidata.

Wikidata es una fuente comunitaria estructurada, no una garantía de exactitud.
La relación identificada permite contrastar los metadatos y las sinopsis
disponibles; no demuestra fidelidad de escenas. Las diferencias argumentales
específicas solo se afirman con fuentes revisadas. Los textos externos siguen
siendo datos no confiables y no pueden conceder permisos.

Si falta asociación o edición coincidente, se informa la falta de evidencia;
no se afirma que la película carezca de libro. Si hay varias obras identificadas,
se pide elegir. Una caída o cuota agotada es un error de proveedor, no un
resultado bibliográfico vacío. Las fechas de edición no se presentan como
fechas originales. Títulos homónimos de otros autores y obras derivadas no
confirman una adaptación.

## Conversación y presupuesto

El estado conserva la pregunta pendiente sobre gustos, película seleccionada,
criterios, candidatas pendientes y referencias. Géneros sencillos, «otra»,
«más reciente», «por qué» y preguntas sobre el libro de la película seleccionada
se resuelven con herramientas y estado estructurado, sin otra inferencia de Groq.
Las peticiones complejas siguen usando el planificador LLM y los esquemas MCP.
TMDB admite equivalencias de géneros en español e inglés contra su taxonomía.

Las solicitudes de adaptación sin título buscan candidatas con la etiqueta
TMDB `818` (basada en novela o libro) y comprueban hasta tres candidatas. Esa
etiqueta orienta la búsqueda, pero no demuestra cuál es el libro. Cada
comparación busca como máximo dos obras de origen en Google Books.

Con `GOOGLE_BOOKS_ENABLED=true`, el MCP incorpora Wikidata sin clave adicional
ni tarjeta. Usa un plazo de cinco segundos, sin reintento inmediato, caché de
24 horas y el almacenamiento compartido de cuotas existente. El presupuesto
local es `2/1s,300/1d`, configurable con `QUOTA_WIKIDATA`; no es una cuota
prometida por el proveedor. TMDB, Google Books y Wikidata mantienen contadores
independientes. Multiplicar réplicas no aumenta las cuotas.

Los errores públicos distinguen TMDB, Google Books, Wikidata y Groq, sin
exponer cuerpos privados de respuestas ni credenciales.

## Validación

Las pruebas sin red cubren gustos, continuaciones, varias candidatas, autores
distintos, traducciones, iniciales, ediciones, fechas contradictorias,
ambigüedad, metadatos maliciosos, cuotas y fallos de proveedores.

Desde la raíz, con Redis y las credenciales locales configurados:

```powershell
$env:RUN_LIVE_EVALS = '1'
pnpm eval:conversations:live
```

El comando inicia y cierra su propio MCP en un puerto local libre, conserva las
cuotas y caché configuradas y guarda un reporte sin secretos en `evals/results/`.
Consume solicitudes reales. Comprueba una conversación multivuelta, la
recomendación de una adaptación, asociaciones ajenas al catálogo manual, un
caso sin evidencia y una petición compleja con Groq. Requiere revisión humana
y no comprueba visualmente la apertura de pestañas.

Para repetir solo la petición compleja después de compilar:

```powershell
pnpm --filter @agichat/mcp-server exec node --env-file-if-exists=.env scripts/agent-journeys-live.mjs --planner-only
```

Usar `--list` en ese comando para listar sin llamar proveedores. Sin
`RUN_LIVE_EVALS=1`, el runner no ejecuta consultas.

Fuentes técnicas: [Wikidata P144](https://www.wikidata.org/wiki/Property:P144),
[SPARQL](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service),
[descubrimiento de TMDB](https://developer.themoviedb.org/reference/discover-movie).
