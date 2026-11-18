# Manual de despliegue

Este manual explica qué está automatizado, qué no, cómo publicar la demo y qué
falta para un despliegue público del producto completo.

## Estado actual

**No hay un despliegue público del producto.** La entrega se ejecuta en local:
Ollama, Redis, el servidor MCP, la API y la demo (ver [ARRANQUE.md](./ARRANQUE.md)).

| Pieza | Situación | Dónde |
| --- | --- | --- |
| Código fuente | Publicado en GitHub | `https://github.com/Juanjoo-Alvarez/ChatAgent_IA` |
| Integración continua | Automatizada en cada PR y en cada push a `main` | `.github/workflows/ci.yml` |
| Versiones del SDK | Automatizadas con release-please: GitHub Releases con bundles ESM e IIFE, paquetes `.tgz` y sumas de verificación | `.github/workflows/release.yml` |
| Demo estática | Preparada para Vercel; no consta un despliegue en el repositorio | `apps/demo/vercel.json` |
| Backend (API, MCP, Redis, Ollama) | Solo local o con Docker Compose | `compose.yaml`, `compose.backend.yaml` |
| Despliegue continuo a producción | No implementado | Ver [CI-CD-Y-SVN.md](../calidad/CI-CD-Y-SVN.md) |

`release.yml` **publica versiones, no despliega la aplicación**. El proceso de
versiones está en [RELEASING.md](../calidad/RELEASING.md).

## Publicar la demo en Vercel

La demo consume `@agichat/embed` mediante su API pública. Ese paquete y sus
dependencias publican sus entradas desde `dist`, así que deben compilarse antes
de ejecutar Vite. Si solo se ejecuta `vite build` en `apps/demo` en una
instalación nueva, aparece un error de resolución de `@agichat/embed`.

### Configuración del proyecto en Vercel

En **Settings** de Vercel:

- **Root Directory:** `apps/demo`.
- Activa **Include source files outside of the Root Directory in the Build
  Step**, para incluir `packages/*` y la configuración del workspace.
- **Framework Preset:** Vite.
- **Install Command:** deja la detección automática. La versión de pnpm está
  declarada en `packageManager` del `package.json` raíz.
- **Node.js Version:** 22.x, como en CI, o una versión compatible más reciente.

El archivo `apps/demo/vercel.json` fija el comando de compilación y el
directorio de salida, con prioridad sobre el panel:

```text
Build Command: pnpm --filter @agichat/demo... run build
Output Directory: dist
```

Los tres puntos del filtro incluyen las dependencias transitivas de la demo, y
pnpm las compila en orden. No marques `@agichat/embed` como externo en Vite: el
navegador necesita su código en el bundle final.

### El chat necesita un backend público

Vercel sirve solo el frontend estático. **El chat funciona únicamente si
`VITE_CHAT_WEBSOCKET_URL` apunta a un backend público `wss://…/chat`.**

- Define `VITE_CHAT_WEBSOCKET_URL=wss://<dominio-público>/chat` en las variables
  del proyecto de Vercel. Se lee durante el build: cambiarla exige un deployment
  nuevo.
- La API debe permitir el origen HTTPS exacto de la demo en
  `CHAT_ALLOWED_ORIGINS`.
- Sin esa variable, el build es válido, pero la demo muestra «El chat no está
  disponible en este momento».
- Nunca pongas credenciales en variables `VITE_*`: Vite las incorpora al
  JavaScript del navegador.

### Validación local del build

```powershell
pnpm install --frozen-lockfile
pnpm --dir apps/demo exec pnpm --filter @agichat/demo... run build
pnpm --filter @agichat/demo preview
```

El build genera `apps/demo/dist/index.html` y sus assets. Los directorios `dist`
no se agregan a Git.

Si un deployment falla después de un cambio en la configuración, crea un
deployment nuevo de la rama. Reintentar un deployment de un commit anterior no
incorpora el cambio. Comprueba que Root Directory sea `apps/demo` y que los logs
muestren el filtro `@agichat/demo...`.

Referencia: [configuración de builds de Vercel](https://vercel.com/docs/builds/configure-a-build).

## Backend con Docker Compose

La receta local con contenedores está en [ARRANQUE.md](./ARRANQUE.md#4-docker-compose-perfil-backend).
`infra/backend.Dockerfile` construye una imagen con la API y el MCP sobre
`node:22-bookworm-slim`, que se ejecuta como el usuario `node`.

## Requisitos para un despliegue público (no realizado)

Esta lista describe lo que haría falta. **Nada de esto está implementado en la
entrega.**

| Requisito | Por qué | Situación |
| --- | --- | --- |
| TLS y `wss://` en el balanceador | El navegador bloquea `ws://` desde una página HTTPS y el token viajaría sin cifrar | No realizado: `infra/nginx.conf` no tiene TLS |
| `CHAT_ALLOWED_ORIGINS` con el dominio real | La API rechaza otros orígenes | No realizado |
| `proxy_read_timeout` mayor que `TURN_TIMEOUT_MS` | El proxy local corta a los 90 s y la guía usa turnos de 180 s | No realizado |
| Redis administrado, con contraseña y TLS | Sesiones, leases, caché y cuotas dependen de Redis | No realizado |
| LLM accesible desde el backend | Ollama corre en un equipo personal | No realizado |
| Varias instancias de LLM o un proveedor en la nube detrás de `LanguageModel` | Ollama es el cuello de botella | No realizado |
| `MCP_ALLOWED_HOSTS` configurado | Protección contra DNS rebinding | Solo en Compose |
| Revisión de límites de abuso y pruebas de carga en el destino real | Las mediciones locales no prueban el rendimiento en producción | No realizado |
| Monitoreo, alertas y reversión | Requisito de cualquier despliegue continuo | No realizado |
| Licencia comercial de TMDB si hay uso comercial | Condiciones de TMDB | No aplica al uso académico |
