# AGIChat

SDK de chat embebible con un agente de IA que recomienda películas, las compara con
sus libros y abre IMDb o Google Books sin que el usuario pulse un enlace. Proyecto
del curso CC3116 de la Universidad del Valle de Guatemala.

[![CI](https://github.com/Juanjoo-Alvarez/ChatAgent_IA/actions/workflows/ci.yml/badge.svg)](https://github.com/Juanjoo-Alvarez/ChatAgent_IA/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Juanjoo-Alvarez/ChatAgent_IA)](https://github.com/Juanjoo-Alvarez/ChatAgent_IA/releases)

![Recomendación de Dune (2021) con su póster en el widget](docs/assets/capturas/02-recomendacion-poster.png)

> **Estado de CI.** El badge aparece en rojo porque GitHub no ejecuta los
> workflows desde el 6 de noviembre de 2026 por un bloqueo de facturación de la
> cuenta propietaria. Lint, build, typecheck y las 775 pruebas pasan en local.
> Ver [VERIFICACION.md](docs/calidad/VERIFICACION.md#estado-de-ci-en-github).

## Contenido

- [Descripción del producto](#descripción-del-producto)
- [Funcionalidades](#funcionalidades)
- [Demostración](#demostración)
- [Arquitectura de alto nivel](#arquitectura-de-alto-nivel)
- [Organización del agente](#organización-del-agente)
- [Escalabilidad](#escalabilidad)
- [Inicio rápido](#inicio-rápido)
- [Configuración](#configuración)
- [Uso del SDK](#uso-del-sdk)
- [Servidor MCP](#servidor-mcp)
- [Seguridad y evals](#seguridad-y-evals)
- [Calidad y flujo de trabajo](#calidad-y-flujo-de-trabajo)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Comandos](#comandos)
- [Documentación](#documentación)
- [Equipo](#equipo)
- [Atribuciones](#atribuciones)
- [Limitaciones conocidas y trabajo futuro](#limitaciones-conocidas-y-trabajo-futuro)

## Descripción del producto

**AGIChat** es una startup ficticia, fundada por Maxine Prompt, que necesita un
chat que sus clientes puedan incrustar en cualquier sitio web con pocas líneas
de código.

- **Fase 1: SDK del widget.** Widget de chat accesible y personalizable,
  distribuido como componente de React, Web Component y API imperativa. Se
  conecta a un transporte simulado mediante un puerto (`ITransportAdapter`) para
  poder cambiar a un agente real sin tocar la interfaz.
- **Fase 2: agente de películas.** El mismo widget habla con un agente que
  recomienda películas con datos de TMDB, muestra sus pósteres, las compara con
  sus libros mediante Google Books, decide si vale la pena verlas y abre IMDb o
  Google Books en una pestaña nueva. Resiste ataques LLM01 y LLM07 de OWASP y
  expone sus herramientas mediante un servidor MCP.

## Funcionalidades

**SDK del widget**

- Widget de chat basado en el wireframe, con tema personalizable ([F1-01](docs/entrega/MATRIZ-REQUISITOS.md#fase-1-sdk-del-widget)).
- SDK con Web Component, API imperativa y componente de React; bundles ESM e IIFE ([F1-02](docs/entrega/MATRIZ-REQUISITOS.md#fase-1-sdk-del-widget)).
- Mensajes del agente en Markdown seguro, sin HTML ([F1-11](docs/entrega/MATRIZ-REQUISITOS.md#fase-1-sdk-del-widget)).
- Transporte simulado y transporte WebSocket intercambiables ([F1-12](docs/entrega/MATRIZ-REQUISITOS.md#fase-1-sdk-del-widget)).
- Cobertura superior al 80 % en los 12 paquetes ([F1-03](docs/entrega/MATRIZ-REQUISITOS.md#fase-1-sdk-del-widget)).

**Agente**

- Recomendaciones con datos de TMDB y tarjetas con póster ([F2-02](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas), [F2-10](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas)).
- Comparación película–libro con veredicto y fuentes ([F2-05](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas)).
- Aviso inicial de que puede comparar con libros ([F2-07](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas)).
- Apertura de IMDb y Google Books sin clic, validada por el servidor ([F2-08](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas), [F2-09](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas)).
- Atribución de TMDB con su logo oficial ([F2-03](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas)).
- Defensas en capas contra LLM01 y LLM07, con evals deterministas y reales ([F2-11](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas), [F2-12](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas), [F2-14](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas)).
- Seis herramientas en un servidor MCP reutilizable por otros clientes ([F2-13](docs/entrega/MATRIZ-REQUISITOS.md#fase-2-agente-de-películas)).

## Demostración

| Bienvenida | Comparación con el libro | Apertura de Google Books |
| --- | --- | --- |
| ![Bienvenida con aviso de capacidades](docs/assets/capturas/01-bienvenida.png) | ![Comparación de Dune con el libro](docs/assets/capturas/03-comparacion-libro.png) | ![Ficha de Dune en Google Libros](docs/assets/capturas/07-abrir-google-books-pestana.png) |

| Orden «Abre IMDb» | Ataque LLM07 rechazado | Vista móvil |
| --- | --- | --- |
| ![Orden para abrir IMDb](docs/assets/capturas/04-abrir-imdb-chat.png) | ![Rechazo de un ataque LLM07](docs/assets/capturas/10-ataque-llm07.png) | ![Widget en un teléfono](docs/assets/capturas/11-movil.png) |

El recorrido completo, con los mensajes exactos, está en el
[guion de la demostración](docs/entrega/GUION-DEMO.md).

## Arquitectura de alto nivel

El widget del Proyecto 1 se comunica con la API de chat. La API ejecuta el
agente de películas y se conecta al modelo de lenguaje y al servidor MCP.
Redis guarda el estado compartido. El servidor MCP consulta las fuentes de
películas, libros y adaptaciones.
[Diagrama de alto nivel](docs/arquitectura/ALTO-NIVEL.md#diagrama-de-contexto).

## Organización del agente

AGIChat usa un único agente con orquestación centralizada. `MovieAgent` resuelve
algunas peticiones directamente y recurre al modelo cuando necesita inferencia.
Con el catálogo de libros habilitado, MCP expone seis herramientas de solo lectura.
[Diagrama de bajo nivel](docs/arquitectura/AGENTE.md#diagrama-de-organización-del-agente).

## Escalabilidad

- **Se replican** la API (con `SESSION_STORE=redis`) y el servidor MCP (con
  `SHARED_STORE=redis`). Una sesión creada en una réplica continúa en otra.
- **El estado vive en Redis**: sesiones, hash del token, turnos, lease del turno
  en curso, caché y contadores de cuota.
- **No escala** el modelo (Ollama es un proceso en un equipo y Groq está limitado
  por su cuota gratuita), ni las cuotas de los proveedores.
  `MAX_CONCURRENT_TURNS` es por réplica.

Mediciones del 18 de noviembre de 2026 sobre `main` (`c1527bf`), AMD Ryzen 7 260
con NVIDIA RTX 5050 Laptop:

| Medición | Resultado |
| --- | --- |
| Dos réplicas en modo fixture, 100 turnos concurrentes | p50 9.8 ms, p95 21.3 ms; 40 correctos y 60 `busy` (2 × 4 plazas); 0 errores de otro tipo |
| Aislamiento, idempotencia, lease, mensaje inmediato y reconexión entre réplicas | Todos correctos |
| LLM real (Ollama) detrás del proxy, 8 turnos | 8 de 8 correctos; p50 1.18 s; 26 solicitudes a TMDB |
| LLM real (Ollama), 3 turnos a la vez | Entre 0.38 y 1.94 s: las peticiones sencillas ya no pasan por el modelo |

Detalle en [ESCALABILIDAD.md](docs/arquitectura/ESCALABILIDAD.md).

## Inicio rápido

**Requisitos:** Node.js 22, Corepack, pnpm 11.19.0, Docker Desktop y un
proveedor de modelo: Ollama con `qwen3:4b-instruct-2507-q4_K_M` o una clave
gratuita de Groq ([GROQ-INICIO.md](docs/GROQ-INICIO.md)). El modo sin
credenciales solo necesita Node.js y pnpm.

```powershell
git clone https://github.com/Juanjoo-Alvarez/ChatAgent_IA.git
cd ChatAgent_IA
corepack enable
pnpm install --frozen-lockfile
```

Si `pnpm` no se reconoce, usa `npx --yes pnpm@11.19.0` (o `npx.cmd` si
PowerShell bloquea scripts).

**Modo sin credenciales.** No usa un LLM ni consulta TMDB:

```powershell
$env:AGENT_MODE = 'fixture'; $env:TOOLS_MODE = 'fixture'; pnpm dev:api
# En otra terminal:
pnpm dev:demo
```

```bash
AGENT_MODE=fixture TOOLS_MODE=fixture pnpm dev:api
pnpm dev:demo
```

**Modo real.** El orden es Ollama → Redis → MCP → API → demo:

```powershell
ollama pull qwen3:4b-instruct-2507-q4_K_M
docker compose up -d --wait redis
# Completa apps/mcp-server/.env y apps/api/.env (ver ARRANQUE.md)
pnpm dev:mcp      # terminal 1
pnpm dev:api      # terminal 2
pnpm dev:demo     # terminal 3
```

Abre `http://127.0.0.1:5173`.

**Docker Compose:**

```powershell
# MCP, API y Redis en contenedores
docker compose -f compose.yaml -f compose.backend.yaml --profile backend up --build
# Además, una segunda réplica y un proxy en el puerto 8080
docker compose -f compose.yaml -f compose.backend.yaml --profile backend --profile scale up --build
```

Paso a paso en [INSTALACION.md](docs/manuales/INSTALACION.md) y
[ARRANQUE.md](docs/manuales/ARRANQUE.md).

## Configuración

| Variable | Aplicación | Valor de la demo | Descripción |
| --- | --- | --- | --- |
| `TMDB_READ_ACCESS_TOKEN` | MCP | Secreto, solo en `apps/mcp-server/.env` | Token de lectura v4 de TMDB |
| `QUOTA_TMDB` | MCP | `1000/1d` | Presupuesto de solicitudes a TMDB |
| `GOOGLE_BOOKS_ENABLED` | MCP | `true` | Habilita las 3 herramientas de libros |
| `QUOTA_GOOGLE_BOOKS` | MCP | `5/1s,1000/1d` | Presupuesto de solicitudes a Google Books |
| `GOOGLE_BOOKS_API_KEY` | MCP | Secreto opcional | Clave gratuita, sin facturación |
| `SHARED_STORE` | MCP | `redis` | Caché y cuotas compartidas |
| `AGENT_MODE`, `TOOLS_MODE` | API | `ollama`, `mcp` | Modo real o `fixture` |
| `SESSION_STORE` | API | `redis` | Sesiones compartidas entre réplicas |
| `TURN_TIMEOUT_MS` | API | `180000` | Tiempo máximo por turno |
| `CHAT_ALLOWED_ORIGINS` | API | `http://localhost:5173,http://127.0.0.1:5173` | Orígenes permitidos |
| `VITE_CHAT_WEBSOCKET_URL` | Demo | `ws://127.0.0.1:8000/chat` | Endpoint de la API |

Nunca escribas secretos en el código ni en variables `VITE_*`. La lista completa,
con los valores predeterminados del código, está en
[CONFIGURACION.md](docs/manuales/CONFIGURACION.md).

## Uso del SDK

**Web Component** (ESM o IIFE):

```html
<script src="agichat-widget.iife.js"></script>
<agi-chat-widget
  title="Películas y libros"
  websocket-url="ws://127.0.0.1:8000/chat"
  tmdb-credits
></agi-chat-widget>
```

**API imperativa con el agente real:**

```ts
import { mountChatWidget, WebSocketTransportAdapter } from "@agichat/embed";

const transport = new WebSocketTransportAdapter({ url: "ws://127.0.0.1:8000/chat", responseTimeoutMs: 185000 });
const unmount = mountChatWidget("#chat", { transport, title: "Hablemos de cine", showTmdbCredits: true });

// Al retirar el widget:
unmount();
transport.dispose();
```

**API imperativa con el mock de la Fase 1:**

```ts
import { mountChatWidget } from "@agichat/embed";
import { MockTransportAdapter } from "@agichat/transport-mock";

const transport = new MockTransportAdapter();
mountChatWidget("#chat", { transport, title: "Asistente de producto" });
```

**React:**

```tsx
import { ChatWidget } from "@agichat/react";
import { WebSocketTransportAdapter } from "@agichat/transport-websocket";

const transport = new WebSocketTransportAdapter({ url: "ws://127.0.0.1:8000/chat" });
export const Chat = () => <ChatWidget transport={transport} title="Películas y libros" showTmdbCredits />;
```

**Tema personalizado.** Las propiedades no indicadas conservan el tema
predeterminado:

```ts
const widget = document.querySelector("agi-chat-widget");
if (widget !== null) {
  widget.theme = { accent: "#0f766e", headerBackground: "#134e4a", userBubbleBackground: "#0f766e", widgetRadius: 20 };
}
```

Atributos, propiedades, ciclo de vida y requisitos del navegador en
[WIDGET-SDK.md](docs/manuales/WIDGET-SDK.md).

## Servidor MCP

`apps/mcp-server` expone 6 herramientas en `http://127.0.0.1:8001/mcp` mediante
Streamable HTTP sin sesión.

| Herramienta | Propósito | Entradas principales | Solo lectura |
| --- | --- | --- | --- |
| `search_movies` | Buscar películas por título | `query`, `year`, `genres` | Sí |
| `get_movie_details` | Detalles, póster e IMDb | `movie_id` | Sí |
| `recommend_movies` | Candidatos filtrados | `genres`, `year_from`, `year_to`, `min_rating`, `original_language` | Sí |
| `search_books` | Buscar libros | `query`, `max_results` | Sí |
| `get_book_details` | Detalles de un libro | `book_id` | Sí |
| `compare_movie_book` | Comparar película y libro | `movie_id`, `book_id`, `preferences` | Sí |

Consumo desde otro cliente (verificado con `@modelcontextprotocol/sdk` 1.32.2):

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "mi-cliente", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:8001/mcp")));
const result = await client.callTool({ name: "search_movies", arguments: { query: "Dune", year: 2021 } });
```

Contratos, errores y cómo agregar herramientas en
[SERVIDOR-MCP.md](docs/manuales/SERVIDOR-MCP.md).

## Seguridad y evals

Se usa el **OWASP Top 10 for LLM Applications 2025**: LLM01 es *Prompt
Injection* y LLM07 es *System Prompt Leakage*. En la edición 2023, LLM07 era
*Insecure Plugin Design*.

Las defensas están en capas y los controles críticos están en código, no solo en
el prompt: detector de ataques con rechazo fijo, lista permitida de herramientas
de solo lectura, validación de argumentos con Ajv, resultados marcados como no
confiables, `safeOutput` (sin URLs, HTML ni el marcador interno) y validación en
la API de toda acción de navegación.

| Evaluación | Casos | Aprobados |
| --- | --- | --- |
| Deterministas en CI (`pnpm eval:agent`), sin LLM | 31 | 31 |
| Reales, funcionales | 10 | 5 |
| Reales, LLM01 | 10 | 10 (0 % de éxito del ataque) |
| Reales, LLM07 | 10 | 10 (0 % de éxito del ataque) |

Las evals reales se ejecutaron el 17 de noviembre de 2026 con **Ollama**
(`qwen3:4b-instruct-2507-q4_K_M`) sobre `ccd40d9` y no se repitieron con Groq.
Las pruebas con Groq (comparación de modelos y conversaciones generales) se
describen en [VERIFICACION.md](docs/calidad/VERIFICACION.md#proveedor-del-modelo-en-cada-evidencia).
La revisión de las respuestas está pendiente de confirmación del equipo.
Análisis caso por caso en [EVALS.md](docs/evals/EVALS.md).

## Calidad y flujo de trabajo

```mermaid
flowchart LR
    A["checkout"] --> B["install"] --> C["lint"] --> D["build"] --> E["typecheck"]
    E --> F["test:coverage con Redis"] --> G["test:compose"] --> H["artefactos de cobertura y build"]
```

- **CI** (`.github/workflows/ci.yml`): el job *Quality gate* corre en cada PR y
  push a `main` con un servicio Redis. **Desde el 6 de noviembre no se ejecuta**
  por un bloqueo de facturación de la cuenta.
- **Releases** (`.github/workflows/release.yml`): release-please mantiene un PR
  de versión. Al fusionarlo publica una GitHub Release con los bundles del SDK,
  paquetes `.tgz` y sumas de verificación. Publica versiones; no despliega la
  aplicación ([RELEASING.md](docs/calidad/RELEASING.md)).

Cobertura con Redis real sobre `c1527bf`, 775 pruebas aprobadas:

| Paquete | Líneas | Ramas | Funciones | Statements |
| --- | --- | --- | --- | --- |
| `core` | 97.5 % | 95.5 % | 96.15 % | 97.5 % |
| `react` | 98.04 % | 97.1 % | 97.67 % | 98.04 % |
| `embed` | 97.68 % | 97.22 % | 100 % | 97.68 % |
| `transport-mock` | 96.36 % | 94.54 % | 100 % | 96.36 % |
| `transport-websocket` | 99.2 % | 94.97 % | 100 % | 99.2 % |
| `protocol` | 100 % | 98.55 % | 100 % | 100 % |
| `agent` | 94.84 % | 89.45 % | 98.21 % | 94.84 % |
| `tmdb` | 99.58 % | 95.07 % | 100 % | 99.58 % |
| `books` | 100 % | 98.64 % | 100 % | 100 % |
| `external-api` | 99.65 % | 95.25 % | 100 % | 99.65 % |
| `apps/api` | 99.69 % | 96.93 % | 97.29 % | 99.69 % |
| `apps/mcp-server` | 98.08 % | 95.1 % | 93.93 % | 98.08 % |

**GitHub Flow:**

1. Actualiza `main` y crea una rama `feature/<paquete>-<tarea>`,
   `fix/<paquete>-<problema>` o `docs/<tema>`.
2. Haz commits pequeños con mensajes en inglés.
3. Abre un PR hacia `main` y pide al menos una aprobación.
4. Fusiona solo con el *Quality gate* en verde. No hay pushes directos a `main`.

Todos los cambios entraron por PR, pero solo 7 de los 23 PR fusionados tienen una
aprobación registrada. Ver [VERIFICACION.md](docs/calidad/VERIFICACION.md).

## Estructura del repositorio

```text
.
├── apps/
│   ├── api/                  # HTTP /sessions, WebSocket /chat y sesiones
│   ├── mcp-server/           # Servidor MCP con 6 herramientas
│   └── demo/                 # Demo de cine que consume el SDK
├── packages/
│   ├── core/                 # Dominio del chat, ChatEngine e ITransportAdapter
│   ├── react/                # Widget, useChat, Markdown, tarjetas y créditos TMDB
│   ├── embed/                # Web Component y mountChatWidget (ESM e IIFE)
│   ├── transport-mock/       # Transporte simulado de la Fase 1
│   ├── transport-websocket/  # Transporte WebSocket real
│   ├── protocol/             # Protocolo v1 validado con zod
│   ├── agent/                # MovieAgent, OllamaModel, GroqModel, McpGateway y políticas
│   ├── tmdb/                 # Cliente TMDB
│   ├── books/                # Cliente Google Books y comparación
│   └── external-api/         # Caché, cuotas y fetch resiliente
├── evals/
│   └── agent-cases.json      # 30 casos reales: funcionales, LLM01 y LLM07
├── infra/                    # Dockerfile del backend y nginx.conf
├── scripts/                  # Evals reales, releases y pruebas de Compose
├── docs/                     # Arquitectura, manuales, evals, calidad y entrega
├── compose.yaml              # Redis
├── compose.backend.yaml      # Perfiles backend y scale
└── .github/workflows/        # CI y releases
```

**Cómo escalar el proyecto:**

| Quiero agregar | Dónde y cómo |
| --- | --- |
| Un transporte | `packages/transport-<nombre>`, implementando `ITransportAdapter` de `core` |
| Un proveedor externo | Un paquete cliente como `packages/tmdb`, que use la caché, `QuotaManager` y `createResilientFetch` de `external-api`, con su variable `QUOTA_<PROVEEDOR>` |
| Una herramienta MCP | `apps/mcp-server/src/tools/`, registrada en `createMcpServer`, con `readOnlyHint: true`. **Además**, agrégala a la lista permitida de `packages/agent/src/McpGateway.ts`; si no, el agente la ignora |
| Otro modelo de lenguaje | Un adaptador de `LanguageModel` en `packages/agent`, como `OllamaModel` |
| Otro agente | Una clase que implemente `ChatAgent` en `packages/agent`, inyectada en `apps/api/src/app.ts` |
| Un caso de eval | `evals/agent-cases.json` para el modelo real y `packages/agent/tests/evaluation.test.ts` para los controles deterministas |
| Una aplicación | `apps/<nombre>`, declarada en `pnpm-workspace.yaml` y usando solo APIs públicas |
| Documentación | `docs/<sección>/`, enlazada desde [docs/README.md](docs/README.md). Si cambia la arquitectura, actualiza los diagramas de `docs/arquitectura/` |

Cada paquete expone su API pública desde `src/index.ts`.

## Comandos

| Comando | Descripción |
| --- | --- |
| `pnpm build` | Compila todos los paquetes y aplicaciones |
| `pnpm dev:demo` | Compila las dependencias e inicia la demo |
| `pnpm dev:api` | Compila las dependencias e inicia la API |
| `pnpm dev:mcp` | Compila las dependencias e inicia el servidor MCP |
| `pnpm eval:agent` | Ejecuta las 31 evals deterministas del agente |
| `pnpm eval:agent:live` | Ejecuta las 30 evals reales con Ollama o Groq según `AGENT_MODE` (requiere `RUN_LIVE_EVALS=1` y el MCP) |
| `pnpm eval:conversations:live` | Conversaciones multivuelta y comparaciones generales reales (requiere `RUN_LIVE_EVALS=1`) |
| `pnpm evidence:tmdb:live` | Genera evidencia de uso real de TMDB (requiere `RUN_LIVE_TMDB=1`) |
| `pnpm lint` | ESLint sin advertencias |
| `pnpm release:prepare` | Genera los artefactos de distribución |
| `pnpm test` | Ejecuta todas las pruebas |
| `pnpm test:compose` | Valida la configuración de Docker Compose |
| `pnpm test:widget` | Pruebas de integración del widget con la API |
| `pnpm test:coverage` | Pruebas con cobertura mínima del 80 % |
| `pnpm typecheck` | Comprueba los tipos; ejecútalo después de `build` |

## Documentación

| Sección | Documentos |
| --- | --- |
| Arquitectura | [Alto nivel](docs/arquitectura/ALTO-NIVEL.md), [Agente](docs/arquitectura/AGENTE.md), [Escalabilidad](docs/arquitectura/ESCALABILIDAD.md), [Protocolo](docs/arquitectura/PROTOCOLO.md), [Caché y cuotas](docs/arquitectura/CACHE-Y-CUOTAS.md) |
| Manuales | [Instalación](docs/manuales/INSTALACION.md), [Configuración](docs/manuales/CONFIGURACION.md), [Arranque](docs/manuales/ARRANQUE.md), [Proveedores](docs/manuales/PROVEEDORES.md), [Despliegue](docs/manuales/DESPLIEGUE.md), [Servidor MCP](docs/manuales/SERVIDOR-MCP.md), [Widget y SDK](docs/manuales/WIDGET-SDK.md), [Inicio con Groq](docs/GROQ-INICIO.md) |
| Evals | [Evals](docs/evals/EVALS.md), [Escenarios TMDB](docs/evals/ESCENARIOS-TMDB.md), [Resultados](docs/evals/resultados/), [Rendimiento y modelos Groq](docs/AGENTE-RENDIMIENTO.md), [Comparaciones generales](docs/AGENTE-COMPARACIONES.md), [Evidencia de libros](docs/BOOKS-EVIDENCIA.md) |
| Calidad | [Verificación](docs/calidad/VERIFICACION.md), [CI/CD y SVN](docs/calidad/CI-CD-Y-SVN.md), [Releases](docs/calidad/RELEASING.md) |
| Entrega | [Matriz de requisitos](docs/entrega/MATRIZ-REQUISITOS.md), [Guion de la demo](docs/entrega/GUION-DEMO.md), [Limitaciones](docs/entrega/LIMITACIONES.md) |

Índice completo en [docs/README.md](docs/README.md). Guía para herramientas
agénticas en [AGENTS.md](AGENTS.md).

## Equipo

| Nombre | Usuario(s) en GitHub | Responsabilidad en la Fase 2 |
| --- | --- | --- |
| Juan José Rivas | `Juanjoo-Alvarez`, `Juanjo Rosales` | Backend, agente, infraestructura, seguridad y runner de evals |
| Saúl Castillo | `llAkihitoll` | Películas: cliente TMDB, servidor MCP, caché y cuotas |
| Daniel Sandoval | `Sandoval` | Libros: cliente Google Books, herramientas MCP de libros y comparación |
| José Sanchez | `josesan28` | Widget, transporte WebSocket, pósteres, atribución y apertura de referencias |
| Andres Ismalej | `Andres Ismalej` | Documentación y preparación de la entrega |

## Atribuciones

<img src="docs/assets/tmdb-logo.svg" alt="The Movie Database (TMDB)" width="140">

**This product uses the TMDB API but is not endorsed or certified by TMDB.**

- Datos y pósteres de películas: [The Movie Database (TMDB)](https://www.themoviedb.org).
  El logo se extrajo sin modificar de `packages/react/src/components/tmdbLogo.ts`.
- Datos de libros: [Google Books](https://books.google.com).
- Uso académico y no comercial. No se registraron tarjetas de crédito en ningún
  proveedor.

## Limitaciones conocidas y trabajo futuro

- No hay despliegue público: todo se ejecuta en local.
- CI no se ejecuta en GitHub desde el 6 de noviembre por un bloqueo de
  facturación de la cuenta.
- En `ccd40d9`, `safeOutput` rechazaba respuestas legítimas cuando el modelo
  copiaba URLs de TMDB. `main` reduce las URLs del contexto; en la medición
  repetida, 8 de 8 turnos fueron correctos.
- El modelo es el cuello de botella; las cuotas de los proveedores no escalan.
- La comparación se apoya en un registro revisado (Dune y The Hunger Games) y en
  Wikidata, una fuente comunitaria.
- Las evidencias se repartieron entre Ollama y Groq y no se repitieron con el otro
  proveedor.
- Las evals reales son una sola ejecución y su revisión está pendiente de
  confirmación.

Lista completa, con causas y trabajo futuro, en
[LIMITACIONES.md](docs/entrega/LIMITACIONES.md).
