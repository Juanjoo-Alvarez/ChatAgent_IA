# Manual de configuración

Este manual lista todas las variables de entorno de AGIChat. Los valores
predeterminados se verificaron en el código del commit `ccd40d9` y se
actualizaron con las variables que agregó después `main` (Groq y Wikidata):

- `apps/api/src/config.ts`
- `apps/mcp-server/src/config.ts`, `packages/tmdb/src/TmdbClient.ts` y
  `packages/books/src/GoogleBooksClient.ts`
- `apps/demo/src/main.ts`

**Nunca escribas valores secretos en el código, en commits ni en variables
`VITE_*`.** Los archivos `.env` están en `.gitignore`. Solo se versionan los
`.env.example`.

## API (`apps/api`)

`pnpm dev:api` lee `apps/api/.env` si existe (`node --env-file-if-exists=.env`).
Las variables del proceso tienen prioridad sobre el archivo.

| Variable | Obligatoria | Predeterminado en el código | Valor recomendado para la demo | Descripción | Secreta |
| --- | --- | --- | --- | --- | --- |
| `CHAT_HOST` | No | `127.0.0.1` | `127.0.0.1` | Interfaz de escucha. Compose usa `0.0.0.0` | No |
| `CHAT_PORT` | No | `8000` | `8000` | Puerto HTTP y WebSocket (1 a 65535) | No |
| `CHAT_ALLOWED_ORIGINS` | No | `http://localhost:5173,http://127.0.0.1:5173` | El mismo | Orígenes exactos permitidos, separados por comas | No |
| `AGENT_MODE` | No | `ollama` | `ollama` o `groq` | `ollama` usa el modelo local; `groq`, el modelo alojado en Groq; `fixture` es un doble sin LLM | No |
| `TOOLS_MODE` | No | `mcp` | `mcp` | `mcp` usa el servidor real; `fixture` solo con `AGENT_MODE=fixture` | No |
| `MCP_URL` | No | `http://127.0.0.1:8001/mcp` | El mismo | Endpoint del servidor MCP | No |
| `OLLAMA_URL` | No | `http://127.0.0.1:11434` | El mismo | Servidor de Ollama | No |
| `OLLAMA_MODEL` | No | `qwen3:4b-instruct-2507-q4_K_M` | El mismo | Etiqueta exacta del modelo | No |
| `GROQ_API_KEY` | Con `AGENT_MODE=groq` | Ninguno | Clave del plan gratuito, sin tarjeta | Credencial de Groq; la API no arranca en modo `groq` sin ella | **Sí** |
| `GROQ_MODEL` | No | `openai/gpt-oss-120b` | El mismo | Modelo de Groq | No |
| `SESSION_STORE` | No | `memory` | `redis` | `memory` para una réplica; `redis` para varias | No |
| `REDIS_URL` | Con `redis` | Ninguno | `redis://127.0.0.1:6379` | Redis compartido | Puede serlo si incluye contraseña |
| `SESSION_TTL_MS` | No | `1800000` (30 min) | El mismo | Inactividad máxima de una sesión | No |
| `TURN_TIMEOUT_MS` | No | `60000` (máximo `300000`) | `180000` | Tiempo máximo por turno | No |
| `MAX_CONNECTIONS` | No | `64` (máximo `10000`) | `64` | Conexiones WebSocket por réplica | No |
| `MAX_CONCURRENT_TURNS` | No | `4` (máximo `1000`) | `4` | Turnos simultáneos por réplica | No |

## Servidor MCP (`apps/mcp-server`)

`pnpm dev:mcp` lee `apps/mcp-server/.env` si existe. Las credenciales y las
cuotas **no tienen valor predeterminado**: si faltan, el servidor no arranca.

| Variable | Obligatoria | Predeterminado en el código | Valor recomendado para la demo | Descripción | Secreta |
| --- | --- | --- | --- | --- | --- |
| `TMDB_READ_ACCESS_TOKEN` | Sí | Ninguno | Token de lectura v4 de la cuenta del equipo | Credencial de TMDB | **Sí** |
| `QUOTA_TMDB` | Sí | Ninguno | `1000/1d` | Presupuesto de solicitudes a TMDB | No |
| `TMDB_LANGUAGE` | No | `es-MX` | `es-MX` | Idioma de títulos, sinopsis y géneros | No |
| `TMDB_TIMEOUT_MS` | No | `8000` | Vacío | Tiempo máximo por consulta a TMDB | No |
| `SHARED_STORE` | No | `redis` | `redis` | `redis` para varias réplicas; `memory` para una | No |
| `REDIS_URL` | Con `redis` | Ninguno | `redis://127.0.0.1:6379` | Redis de caché y cuotas | Puede serlo si incluye contraseña |
| `MCP_HOST` | No | `127.0.0.1` | `127.0.0.1` | Interfaz de escucha | No |
| `MCP_PORT` | No | `8001` | `8001` | Puerto | No |
| `MCP_PATH` | No | `/mcp` | `/mcp` | Ruta del endpoint; debe empezar por `/` | No |
| `MCP_ALLOWED_HOSTS` | No | Vacío (sin comprobación) | Vacío en local | Valores aceptados en la cabecera `Host` (protección contra DNS rebinding) | No |
| `GOOGLE_BOOKS_ENABLED` | No | Deshabilitado (solo `true` lo activa) | `true` | Registra las 3 herramientas de libros | No |
| `QUOTA_GOOGLE_BOOKS` | Si libros está activo | Ninguno | `5/1s,1000/1d` | Presupuesto de solicitudes a Google Books | No |
| `GOOGLE_BOOKS_API_KEY` | No | Ninguno | Vacío | Clave opcional de Google Books | **Sí** |
| `GOOGLE_BOOKS_TIMEOUT_MS` | No | `8000` | `8000` | Tiempo máximo por consulta a Google Books | No |
| `QUOTA_WIKIDATA` | No | `2/1s,300/1d` | El mismo | Presupuesto de consultas a Wikidata, que se usa con libros habilitados | No |

## Demo (`apps/demo`)

Vite incorpora las variables `VITE_*` al JavaScript del navegador. **Solo pueden
contener direcciones públicas, nunca credenciales.** Se leen durante el build:
cambiarlas exige reiniciar Vite o compilar de nuevo.

| Variable | Obligatoria | Predeterminado en el código | Valor recomendado para la demo | Descripción | Secreta |
| --- | --- | --- | --- | --- | --- |
| `VITE_CHAT_WEBSOCKET_URL` | En producción | `ws://127.0.0.1:8000/chat` solo en desarrollo; en un build sin valor el chat aparece como no disponible | `ws://127.0.0.1:8000/chat` (o `ws://127.0.0.1:8080/chat` con el proxy) | Endpoint WebSocket de la API, terminado en `/chat` | No |
| `VITE_CHAT_RESPONSE_TIMEOUT_MS` | No | `185000` | `185000` | Espera del navegador; debe superar `TURN_TIMEOUT_MS` | No |

## Scripts de evaluación y evidencia

| Variable | Usada por | Descripción |
| --- | --- | --- |
| `RUN_LIVE_EVALS` | `pnpm eval:agent:live`, `pnpm eval:conversations:live` | Debe valer `1` para hacer llamadas reales |
| `AGENT_MODE`, `OLLAMA_URL`, `OLLAMA_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, `MCP_URL` | `pnpm eval:agent:live` | Se leen de `apps/api/.env`; `AGENT_MODE` elige Ollama o Groq |
| `RUN_LIVE_TMDB` | `pnpm evidence:tmdb:live` | Debe valer `1` para consultar TMDB a través del MCP |
| `REDIS_URL` | `pnpm test:coverage` | Si está definida, se ejecutan las pruebas de integración con Redis real |

## Formato de las cuotas

```text
<cantidad>/<duración>[,<cantidad>/<duración>...]
```

Unidades: `ms`, `s`, `m`, `h` y `d`. Se pueden combinar varias ventanas; una
solicitud solo se envía si cabe en todas. Ejemplos:

| Valor | Significado |
| --- | --- |
| `1000/1d` | Hasta 1000 solicitudes por día |
| `5/1s,1000/1d` | Hasta 5 por segundo y 1000 por día |

Las cuotas se comparten entre réplicas mediante Redis. Su funcionamiento está
en [CACHE-Y-CUOTAS.md](../arquitectura/CACHE-Y-CUOTAS.md).

## Diferencias entre `.env.example` y la guía

Los archivos de ejemplo y la guía de arranque usan valores distintos. **Para
la demo se usan los de la guía.** Los archivos de ejemplo no se modificaron.

| Variable | `.env.example` | Guía de arranque | Efecto |
| --- | --- | --- | --- |
| `QUOTA_TMDB` (`apps/mcp-server`) | Vacío | `1000/1d` | Vacío impide arrancar el MCP: es obligatoria |
| `GOOGLE_BOOKS_ENABLED` (`apps/mcp-server`) | `false` | `true` | Con `false` no existen las herramientas de libros |
| `QUOTA_GOOGLE_BOOKS` (`apps/mcp-server`) | `5/1s,300/1d` | `5/1s,1000/1d` | Presupuesto diario distinto |
| `SESSION_STORE` (`apps/api`) | `memory` | `redis` | Con `memory` no se pueden usar varias réplicas |
| `TURN_TIMEOUT_MS` (`apps/api`) | `60000` | `180000` | Con 60 s, un modelo local lento termina en `timeout` |
