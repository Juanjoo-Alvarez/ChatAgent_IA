# Manual de arranque

Este manual explica cómo levantar AGIChat en local, en el orden correcto, y cómo
comprobar cada servicio. Antes de empezar, completa la
[instalación](./INSTALACION.md). Todas las variables están descritas en
[CONFIGURACION.md](./CONFIGURACION.md).

Ejecuta todos los comandos desde la raíz del repositorio. Los ejemplos usan
PowerShell; la variante para bash aparece cuando es distinta.

> Si `pnpm` no se reconoce en tu terminal, sustitúyelo por
> `npx --yes pnpm@11.19.0`. Si PowerShell bloquea `npx.ps1` por la política de
> ejecución, usa `npx.cmd --yes pnpm@11.19.0`.

## Modos de ejecución

| Modo | Para qué sirve | Necesita |
| --- | --- | --- |
| Sin credenciales (`fixture`) | Probar el widget, la API y el WebSocket sin LLM ni proveedores | Node y pnpm |
| Real | Producto completo: Ollama, TMDB y Google Books | Docker, Ollama, token TMDB |
| Compose `backend` | MCP, API y Redis en contenedores | Docker y variables en el entorno |
| Compose `scale` | Dos réplicas de la API detrás de un proxy | Lo mismo que `backend` |

## 1. Modo sin credenciales

Este modo recorre HTTP, WebSocket y el widget. **No usa un LLM ni consulta TMDB**
y no sirve para evaluar al modelo. Devuelve una película ficticia y el
encabezado del widget muestra «Modo de prueba · En línea».

Terminal 1:

```powershell
$env:AGENT_MODE = 'fixture'
$env:TOOLS_MODE = 'fixture'
pnpm dev:api
```

```bash
AGENT_MODE=fixture TOOLS_MODE=fixture pnpm dev:api
```

Terminal 2:

```powershell
pnpm dev:demo
```

Abre `http://127.0.0.1:5173`. `AGENT_MODE=fixture` con `TOOLS_MODE=mcp` también
es válido: consulta datos reales del MCP sin llamar al modelo. La combinación
`AGENT_MODE=ollama` con `TOOLS_MODE=fixture` se rechaza al iniciar.

## 2. Modo real, paso a paso

El orden es **Ollama → Redis → MCP → API → demo**. Cada servicio depende del
anterior.

### 2.1 Ollama

Abre la aplicación de Ollama. Se queda en la bandeja del sistema y sirve en el
puerto 11434. Comprueba que responde y que el modelo está descargado:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
ollama list
```

```bash
curl -s http://127.0.0.1:11434/api/tags
```

Usa la etiqueta exacta `qwen3:4b-instruct-2507-q4_K_M`. La etiqueta `qwen3:4b`
apunta a la variante *Thinking*, que puede agotar el tiempo del turno aunque se
envíe `think: false`. Si el puerto ya está ocupado por Ollama, usa ese servidor;
no inicies una segunda instancia con `ollama serve`.

Para comprobar si el modelo usa la GPU, ejecuta `ollama ps` después de una
consulta. La columna `PROCESSOR` debe indicar `100% GPU`.

### 2.2 Redis

Abre Docker Desktop y espera a que el motor esté listo. Después:

```powershell
docker compose up -d --wait redis
```

Redis queda disponible en `redis://127.0.0.1:6379`, publicado solo en
`127.0.0.1`.

### 2.3 Servidor MCP

Crea el archivo local solo si todavía no existe:

```powershell
if (-not (Test-Path apps/mcp-server/.env)) {
  Copy-Item apps/mcp-server/.env.example apps/mcp-server/.env
}
```

```bash
[ -f apps/mcp-server/.env ] || cp apps/mcp-server/.env.example apps/mcp-server/.env
```

En CMD: `copy apps\mcp-server\.env.example apps\mcp-server\.env`.

Edita `apps/mcp-server/.env` y completa estos valores. El token lo obtienes como
se explica en [PROVEEDORES.md](./PROVEEDORES.md):

```dotenv
TMDB_READ_ACCESS_TOKEN=<token de lectura v4 de TMDB>
QUOTA_TMDB=1000/1d
SHARED_STORE=redis
REDIS_URL=redis://127.0.0.1:6379
GOOGLE_BOOKS_ENABLED=true
QUOTA_GOOGLE_BOOKS=5/1s,1000/1d
GOOGLE_BOOKS_API_KEY=
GOOGLE_BOOKS_TIMEOUT_MS=8000
```

Estos límites son el presupuesto del proyecto, no una garantía del proveedor.
Redúcelos si tu cuenta dispone de menos solicitudes. No actives facturación.

Terminal 1, déjala en ejecución:

```powershell
pnpm dev:mcp
```

El servidor escucha en `http://127.0.0.1:8001/mcp`. Con libros habilitados
anuncia seis herramientas: `search_movies`, `get_movie_details`,
`recommend_movies`, `search_books`, `get_book_details` y `compare_movie_book`.

### 2.4 API del agente

```powershell
if (-not (Test-Path apps/api/.env)) {
  Copy-Item apps/api/.env.example apps/api/.env
}
```

En `apps/api/.env`, conserva el resto de opciones y establece:

```dotenv
AGENT_MODE=ollama
TOOLS_MODE=mcp
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b-instruct-2507-q4_K_M
MCP_URL=http://127.0.0.1:8001/mcp
SESSION_STORE=redis
REDIS_URL=redis://127.0.0.1:6379
CHAT_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
TURN_TIMEOUT_MS=180000
```

Terminal 2, déjala en ejecución:

```powershell
pnpm dev:api
```

Usa una terminal nueva para no heredar `AGENT_MODE=fixture` ni
`TOOLS_MODE=fixture` de pruebas anteriores. Las variables del proceso tienen
prioridad sobre el archivo `.env`.

### 2.5 Demo

Terminal 3:

```powershell
pnpm dev:demo
```

Abre `http://127.0.0.1:5173`. El encabezado del chat debe mostrar
«Asistente virtual · En línea», no «Modo de prueba · En línea». Si Vite usa otro puerto, agrega ese origen exacto a
`CHAT_ALLOWED_ORIGINS` y reinicia la API.

La API permite 180 s por turno y la demo espera 185 s. El margen permite recibir
el error del servidor antes de que el navegador cancele la petición. Si cambias
`TURN_TIMEOUT_MS`, ajusta también `VITE_CHAT_RESPONSE_TIMEOUT_MS` en
`apps/demo/.env` y reinicia Vite. La primera petición tarda más porque Ollama
carga el modelo en memoria.

### 2.6 Recorrido de comprobación

1. «Quiero ver Dune (2021). Dame su año, géneros y valoración en una lista corta».
2. Comprueba el póster y los créditos de TMDB.
3. «Consulta los detalles de la película con ID 438631 y dime su identificador
   de IMDb. No escribas enlaces, URLs ni avisos».
4. «Busca el libro Dune de Frank Herbert, compáralo con la película con ID 438631
   y dime si vale la pena verla. No escribas enlaces, URLs ni avisos».
5. «Abre IMDb».
6. «Abre Google Books JhJ7cgAACAAJ».

Las frases «No escribas enlaces, URLs ni avisos» evitan que el modelo copie URLs
de TMDB, porque `safeOutput` rechazaría la respuesta con `policy_denied` (ver
[LIMITACIONES.md](../entrega/LIMITACIONES.md)). La búsqueda de libros devuelve
varias ediciones, así que Google Books necesita el identificador. El catálogo de
adaptaciones verificadas solo incluye Dune (2021). El guion completo está en
[GUION-DEMO.md](../entrega/GUION-DEMO.md).

## 3. Comprobar cada servicio

| Servicio | Comprobación | Resultado esperado |
| --- | --- | --- |
| Ollama | `Invoke-RestMethod http://127.0.0.1:11434/api/tags` | Lista que incluye el modelo |
| Redis | `docker compose ps` | `redis` en estado `healthy` |
| MCP | `Invoke-RestMethod http://127.0.0.1:8001/healthz` | `status: ok` |
| MCP (herramientas) | Petición `tools/list` de [SERVIDOR-MCP.md](./SERVIDOR-MCP.md#solicitud-http-directa) | 6 herramientas |
| API | `Invoke-RestMethod http://127.0.0.1:8000/healthz` | `status: ok` |
| Demo | Abrir `http://127.0.0.1:5173` | «Asistente virtual · En línea» |

`/healthz` comprueba que el proceso está vivo. No verifica que Ollama, MCP o
TMDB estén disponibles.

## 4. Docker Compose: perfil `backend`

Compose levanta Redis, el MCP y la API en contenedores. Ollama sigue en el
anfitrión y los contenedores lo alcanzan en `host.docker.internal:11434`.

Compose **no lee** `apps/mcp-server/.env` ni `apps/api/.env`. Toma las variables
del entorno de la terminal o de un archivo `.env` en la raíz. Como mínimo
necesita `TMDB_READ_ACCESS_TOKEN` y `QUOTA_TMDB`. Para habilitar libros, define
también `GOOGLE_BOOKS_ENABLED=true` y `QUOTA_GOOGLE_BOOKS`.

```powershell
docker compose -f compose.yaml -f compose.backend.yaml --profile backend up --build
```

Puertos: API en 8000, MCP en 8001 y Redis en 6379.

Compose fija `TURN_TIMEOUT_MS` en su valor predeterminado (60 s) porque no lo
declara. Si el modelo tarda más en tu equipo, el turno terminará en `timeout`.

## 5. Docker Compose: perfil `scale`

Agrega una segunda réplica de la API y un proxy nginx que reparte las
conexiones entre ambas:

```powershell
docker compose -f compose.yaml -f compose.backend.yaml --profile backend --profile scale up --build
```

| Servicio | Puerto |
| --- | --- |
| Proxy | 8080 |
| API réplica A | 8000 |
| API réplica B | 8002 |

Para que la demo use el proxy, crea `apps/demo/.env` con
`VITE_CHAT_WEBSOCKET_URL=ws://127.0.0.1:8080/chat` y reinicia Vite.

El proxy local no tiene TLS y su `proxy_read_timeout` es de 90 s. Ver
[ESCALABILIDAD.md](../arquitectura/ESCALABILIDAD.md) y
[LIMITACIONES.md](../entrega/LIMITACIONES.md).

## 6. Resolución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `pnpm` no se reconoce | pnpm no está en el PATH | Usa `npx --yes pnpm@11.19.0` |
| `npx.ps1` no se puede cargar | Política de ejecución de PowerShell | Usa `npx.cmd` o `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `ollama` no se reconoce | La terminal se abrió antes de instalar Ollama | Abre una terminal nueva o usa `$env:LOCALAPPDATA\Programs\Ollama\ollama.exe` |
| La API en Docker no alcanza Ollama | Ollama solo escucha en `127.0.0.1` del anfitrión | Configura Ollama para aceptar la red local de Docker sin exponerlo públicamente |
| La demo muestra «El chat no está disponible en este momento» o hay un 403 | El origen de la demo no está en `CHAT_ALLOWED_ORIGINS` | Agrega el origen exacto y reinicia la API |
| La pestaña de IMDb o Google Books no se abre | El navegador bloqueó la ventana emergente | Permite ventanas emergentes solo para el origen de la demo y repite la orden |
| «Necesito una referencia identificada» | Hay varias referencias o ninguna | Indica el identificador después del proveedor |
| Error `quota_exhausted` en el MCP | Se alcanzó `QUOTA_TMDB` o `QUOTA_GOOGLE_BOOKS` | Espera el tiempo indicado en `retry_after_ms` o ajusta el presupuesto |
| El turno termina en `timeout` | El modelo tarda más que `TURN_TIMEOUT_MS` | Usa `TURN_TIMEOUT_MS=180000` y comprueba que Ollama use la GPU |
| `chat_start_failed` al iniciar la API | Configuración inválida, puerto ocupado o Redis caído | Revisa las variables, el puerto 8000 y `docker compose ps` |
| `invalid_configuration` al iniciar el MCP | Falta `TMDB_READ_ACCESS_TOKEN`, `QUOTA_TMDB` o `QUOTA_GOOGLE_BOOKS` | Completa `apps/mcp-server/.env` |
