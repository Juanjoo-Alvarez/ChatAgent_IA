# Inicio local con Ollama, películas y libros

Guía para Juan Jose Rivas Alvarez (24856), CC3116. Ejecutar desde la raíz del
repositorio. No requiere registrar una tarjeta. Las credenciales se guardan en
archivos `.env` ignorados por Git; no enviarlas al chat ni incluirlas en commits.

## Requisitos

- Node.js 22 y pnpm 11.19.0, según el README.
- Docker Desktop iniciado para Redis.
- Token de lectura TMDB configurado para el uso académico indicado por el curso.
- Google Books habilitado en el MCP, con su propio presupuesto de solicitudes.

Si `pnpm` falla por un Corepack ausente, se puede ejecutar la versión exacta
mediante npm, sin reemplazar la instalación global:

```powershell
npx --yes pnpm@11.19.0 install --frozen-lockfile
```

En los comandos posteriores puede sustituirse `pnpm` por
`npx --yes pnpm@11.19.0`. npm incorpora el ejecutable a PATH para los procesos
hijos, incluidos los scripts que llaman de nuevo a pnpm; véase [npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec/).

## 1. Instalar y comprobar Ollama

Usar el instalador oficial de [Ollama para Windows](https://docs.ollama.com/windows).
Después de instalar, abrir una terminal nueva. La aplicación inicia su servidor
en segundo plano en el puerto 11434.

```powershell
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama list
ollama run qwen3:4b-instruct-2507-q4_K_M "Responde únicamente: listo."
```

Se eligió [qwen3:4b-instruct-2507-q4_K_M](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M), con soporte de herramientas.
Usar esa etiqueta exacta: `qwen3:4b` apunta actualmente a la variante Thinking,
que puede agotar el tiempo del turno aunque se envíe `think: false`.
Si ya se descargó `qwen3:4b`, descargar también la variante Instruct y actualizar
`OLLAMA_MODEL` en `apps/api/.env`; reiniciar la API después del cambio.
La descarga del modelo ronda 2.5 GB, además de la instalación y memoria de
ejecución. La velocidad debe medirse en el equipo que ejecutará el producto.

Comprobar que el servidor responde:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

Si la aplicación de Ollama no está ejecutándose, iniciar `ollama serve` en una
terminal separada. Si el puerto ya está ocupado por Ollama, usar ese servidor;
no iniciar una segunda instancia. Esta guía ejecuta MCP y API en Windows, por
lo que Ollama puede conservar su dirección local predeterminada.

## 2. Instalar dependencias e iniciar Redis

```powershell
pnpm install --frozen-lockfile
docker compose up -d --wait redis
```

Redis debe estar disponible en `redis://127.0.0.1:6379`. Si otro servicio usa ese
puerto, ajustar el mapeo de desarrollo y ambos `REDIS_URL` de forma consistente.

## 3. Configurar películas y libros

Crear el archivo local solo si todavía no existe:

```powershell
if (-not (Test-Path apps/mcp-server/.env)) {
  Copy-Item apps/mcp-server/.env.example apps/mcp-server/.env
}
```

Editar `apps/mcp-server/.env` y completar:

```dotenv
TMDB_READ_ACCESS_TOKEN=REEMPLAZAR_CON_TOKEN_DE_LECTURA
QUOTA_TMDB=1000/1d
SHARED_STORE=redis
REDIS_URL=redis://127.0.0.1:6379
GOOGLE_BOOKS_ENABLED=true
QUOTA_GOOGLE_BOOKS=5/1s,1000/1d
GOOGLE_BOOKS_API_KEY=
GOOGLE_BOOKS_TIMEOUT_MS=8000
```

Los límites anteriores son presupuestos del proyecto, no una garantía de cuota
del proveedor; reducirlos si la cuenta dispone de menos solicitudes. El cliente
admite la clave de Google Books como opcional; configurarla en ese mismo archivo
si el proveedor exige identificar las consultas. No activar facturación de pago.

En una primera terminal, dejar ejecutándose:

```powershell
pnpm dev:mcp
```

El MCP publica películas y libros en `http://127.0.0.1:8001/mcp`. Con libros
habilitados debe anunciar seis herramientas: `search_movies`, `get_movie_details`,
`recommend_movies`, `search_books`, `get_book_details` y `compare_movie_book`.

## 4. Configurar e iniciar el agente

```powershell
if (-not (Test-Path apps/api/.env)) {
  Copy-Item apps/api/.env.example apps/api/.env
}
```

En `apps/api/.env`, conservar el resto de opciones y establecer:

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

En una segunda terminal, dejar ejecutándose:

```powershell
pnpm dev:api
```

Usar terminales nuevas para no heredar `AGENT_MODE=fixture` o `TOOLS_MODE=fixture`
de las pruebas anteriores. Las variables del proceso tienen prioridad sobre `.env`.
Si se reutiliza una terminal de fixtures, retirar esas dos variables de esa
terminal antes de arrancar el agente.

## 5. Abrir el producto y probarlo

En una tercera terminal:

```powershell
pnpm dev:demo
```

Abrir `http://127.0.0.1:5173`. El chat debe mostrar «En línea», sin el aviso
«Modo de prueba»; la API registra `mode: "ollama"` al iniciar. Si Vite utiliza otro puerto, añadir su origen exacto a
`CHAT_ALLOWED_ORIGINS` y reiniciar la API.

Para las pruebas locales se permiten 180 segundos por turno en la API y 185
segundos en la demo. El margen permite recibir el error del servidor antes de que
el navegador cancele la petición. Si se cambia `TURN_TIMEOUT_MS`, ajustar también
`VITE_CHAT_RESPONSE_TIMEOUT_MS` en `apps/demo/.env` y reiniciar Vite. La primera
petición puede tardar más al cargar el modelo; medir también una segunda consulta.

Probar este recorrido:

1. «Busca Dune de 2021 y consulta sus detalles, incluido IMDb».
2. Comprobar póster y créditos TMDB.
3. «Busca Dune de Frank Herbert y compárala con la película anterior».
4. «¿Puedes abrir IMDb?».
5. «¿Podrías abrir Google Books?».

El catálogo actual verifica la adaptación de Dune (2021). Si aparecen varias
ediciones o referencias, seleccionar la correspondiente o indicar su ID después
del proveedor. Las dos páginas se solicitan por separado. Si el navegador
bloquea ventanas emergentes, permitirlas únicamente para el origen de la demo
y repetir la petición; no hace falta pulsar un enlace de la respuesta.

Solo después de que este recorrido funcione, ejecutar las evals reales:

```powershell
$env:RUN_LIVE_EVALS = '1'
pnpm eval:agent:live
```

Estas evals realizan consultas reales y guardan resultados en `evals/results/`.
Revisar las respuestas y fuentes manualmente antes de compartir evidencias.
Los casos deterministas de `pnpm eval:agent` no sustituyen esta ejecución.

## Uso posterior de toda la infraestructura en Compose

El arranque anterior lee `apps/mcp-server/.env` y `apps/api/.env`. En cambio,
`docker compose -f compose.yaml -f compose.backend.yaml ...` toma las variables
del entorno o de un `.env` en la raíz; no lee automáticamente los archivos de
las aplicaciones. Para habilitar libros también en ese despliegue, definir allí
`GOOGLE_BOOKS_ENABLED=true`, `QUOTA_GOOGLE_BOOKS` y, si se usa, `GOOGLE_BOOKS_API_KEY`.
`GOOGLE_BOOKS_TIMEOUT_MS` tiene un valor predeterminado de 8000.

Las pruebas de esta configuración se ejecutan con `pnpm test:compose`; requieren
Docker CLI con Compose, pero no levantan contenedores ni llaman a proveedores.
La receta con dos réplicas está en [BACKEND-AGENTE.md](./BACKEND-AGENTE.md).
