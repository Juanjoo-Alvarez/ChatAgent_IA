# Escenarios de evaluación de la integración con TMDB

Cada escenario se ejecuta de extremo a extremo: un cliente MCP real se conecta
por Streamable HTTP al servidor, que consulta un TMDB simulado. No hay llamadas
reales a TMDB ni credenciales.

- Datos: [`apps/mcp-server/tests/evaluation/dataset.ts`](../apps/mcp-server/tests/evaluation/dataset.ts)
- Pruebas: [`apps/mcp-server/tests/evaluation/evaluation.test.ts`](../apps/mcp-server/tests/evaluation/evaluation.test.ts)

```bash
pnpm --filter @agichat/tmdb build
pnpm --filter @agichat/mcp-server test
```

| # | Escenario | Respuesta simulada | Resultado esperado |
| --- | --- | --- | --- |
| 1 | Información completa | Detalles con póster e IMDb | `missing_fields: []` y referencia `imdb`. |
| 2 | Sin póster | `poster_path: null` | Película entregada, `poster: null`, `missing_fields: ["poster"]`. |
| 3 | Sin IMDb | `external_ids.imdb_id: null` | `imdb_id: null`, estado `missing` y referencia a la ficha de TMDB. |
| 4 | Título ambiguo | Dos coincidencias exactas y una parcial | `ambiguous: true` con ambos IDs; con el año, `ambiguous: false`. |
| 5 | Sin resultados | `results: []` | Lista vacía, no error. |
| 6 | Respuesta incompleta | Solo `{ id }` y `external_ids` con 503; HTML en lugar de JSON | Nulos explícitos e IMDb `unavailable`; el HTML produce `bad_response`. |
| 7 | Prompt injection | Sinopsis con instrucciones y caracteres invisibles | Texto visible intacto, invisibles eliminados, `suspected_instruction_fields: ["overview"]` y `tools/list` sin cambios. |
| 8 | Timeout | Respuesta que nunca llega | `timeout` recuperable; la solicitud cuenta en la cuota porque llegó a enviarse. |
| 9 | Límite de solicitudes | 429 con `Retry-After` de 1 s; 429 con 120 s; cuota local de 1 | Reintento y éxito (2 solicitudes contadas); `rate_limited` con `retry_after_ms: 120000` sin esperar; `quota_exhausted` sin llamar a TMDB. |
| 10 | Servicio no disponible | 503 permanente; 401 | 3 intentos y `unavailable` recuperable; el 401 no se reintenta; el servidor sigue atendiendo. |
| 11 | Caché | Misma búsqueda repetida y otra página | Una sola consulta por parámetros distintos; los errores no se guardan. |
| 12 | Réplicas concurrentes | 3 réplicas con almacenamiento compartido, 12 solicitudes y límite 5 | Exactamente 5 éxitos y 7 `quota_exhausted`; la caché se comparte entre réplicas. |

## Alcance del escenario 12

La suite de evaluación comparte un almacenamiento en memoria entre tres
instancias del servidor. Así comprueba la lógica de coordinación sin depender
de Docker. La atomicidad con Redis real la validan las pruebas de
`packages/external-api/tests/redis.integration.test.ts`: 45 solicitudes
concurrentes desde 3 conexiones con límite 10. Estas pruebas se ejecutan
cuando existe `REDIS_URL`, siempre en el job `Quality gate` de CI.

## Política de errores y reintentos

| Error | Reintento automático | Contabiliza cuota |
| --- | --- | --- |
| 429, 500, 502, 503, 504 | Sí, hasta 3 intentos con backoff exponencial y jitter. Respeta `Retry-After` hasta 10 s. | Cada intento |
| Fallo de red | Sí, con el mismo límite | Solo si la conexión llegó a establecerse |
| Timeout (`TMDB_TIMEOUT_MS`) | No: el plazo es el total de la operación | Sí |
| 400, 401, 403, 404, 422 | No | Sí |
| Cuota agotada o Redis caído | No | No |

Los reintentos y los rechazos de cuota quedan en los logs (`tmdb_retry`,
`quota_rejected`), al igual que cada llamada a una herramienta (`tool_call`,
con código y duración). Los logs nunca incluyen el token.

## Tratamiento del contenido externo

1. Títulos, sinopsis y géneros se entregan **sin modificar su texto visible**.
2. Se eliminan caracteres invisibles que pueden ocultar texto a un lector
   humano: controles, marcas de override bidireccional, espacios de ancho cero
   y "tag characters" Unicode. Se conservan ZWJ, ZWNJ, LRM y RLM por sus usos
   legítimos en varios idiomas.
3. Una heurística marca en `provenance.suspected_instruction_fields` los campos
   que parecen instrucciones para un agente. Es una señal, no un filtro: puede
   tener falsos positivos y nunca elimina contenido.
4. Las descripciones de herramientas y las instrucciones del servidor son
   estáticas. El contenido de TMDB solo aparece dentro de campos de datos.
