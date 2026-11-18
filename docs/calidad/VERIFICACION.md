# Verificación y evidencias de calidad

Este informe reúne los resultados de las validaciones automatizadas y separa lo
verificado de lo que sigue pendiente. Cada número sale de un comando ejecutado.

## Contexto de la ejecución

| Dato | Valor |
| --- | --- |
| Fecha | 18 de noviembre de 2026 |
| Código medido | `main` en `c1527bf` (con Groq, Wikidata y los ajustes del agente) más la documentación de la rama `docs/documentacion` |
| Medición anterior | 17 de noviembre sobre `ccd40d9`: 606 pruebas. Se repitió tras integrar `main` |
| Sistema | Windows 11 Home Single Language 10.0.26200 |
| CPU | AMD Ryzen 7 260 w/ Radeon 780M Graphics, 8 núcleos y 16 hilos |
| RAM | 15.3 GB |
| GPU | NVIDIA GeForce RTX 5050 Laptop GPU y AMD Radeon 780M Graphics |
| Node.js | 24.19.0 (CI usa Node 22) |
| pnpm | 11.19.0 |
| Docker | 29.8.2 |
| Ollama | 0.40.16 |
| Redis | `redis:7.4-alpine` de `compose.yaml` |

## Proveedor del modelo en cada evidencia

El agente admite dos proveedores de modelo detrás del puerto `LanguageModel`:
**Ollama** local (`qwen3:4b-instruct-2507-q4_K_M`, valor predeterminado de
`AGENT_MODE`) y **Groq** alojado (`AGENT_MODE=groq`, con `openai/gpt-oss-120b`
como modelo predeterminado). El proyecto empezó a validarse con Ollama y después
incorporó Groq. Las evidencias no se repitieron con el otro proveedor. Esta tabla
indica con qué se hizo cada una:

| Evidencia | Proveedor del modelo | Base de código | Documento |
| --- | --- | --- | --- |
| 30 evals reales (`promptVersion: "v1"`) | **Ollama**, `qwen3:4b-instruct-2507-q4_K_M` | `ccd40d9` | [EVALS.md](../evals/EVALS.md) |
| Medición C de escalabilidad (extremo a extremo con 2 réplicas) | **Ollama** | `ccd40d9` y repetida sobre `c1527bf` | [ESCALABILIDAD.md](../arquitectura/ESCALABILIDAD.md#mediciones) |
| Capturas del producto y guion de la demo | **Ollama** | `ccd40d9` | [GUION-DEMO.md](../entrega/GUION-DEMO.md) |
| Traza que explica los rechazos de `safeOutput` | **Ollama** | `ccd40d9` | [LIMITACIONES.md](../entrega/LIMITACIONES.md) |
| Diagnóstico de rendimiento del agente local | **Ollama** | Posterior a `ccd40d9` | [AGENTE-RENDIMIENTO.md](../AGENTE-RENDIMIENTO.md) |
| Comparación de modelos del 18 de noviembre | **Groq** (`openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`), con Ollama como referencia | Posterior a `ccd40d9` | [AGENTE-RENDIMIENTO.md](../AGENTE-RENDIMIENTO.md#comparación-de-modelos-groq) |
| Conversaciones multivuelta y comparaciones generales con Wikidata (`pnpm eval:conversations:live`) | **Groq** | Posterior a `ccd40d9` | [AGENTE-COMPARACIONES.md](../AGENTE-COMPARACIONES.md) |
| Integración con Groq y su configuración | **Groq** | Posterior a `ccd40d9` | [GROQ-INICIO.md](../GROQ-INICIO.md) |
| Evidencia real de libros con Google Books | Ninguno: no usa LLM | Posterior a `ccd40d9` | [BOOKS-EVIDENCIA.md](../BOOKS-EVIDENCIA.md) |
| Mediciones A y B de escalabilidad (modo fixture) | Ninguno: dobles deterministas | `c1527bf` | [ESCALABILIDAD.md](../arquitectura/ESCALABILIDAD.md#mediciones) |
| Pruebas automatizadas, cobertura y evals deterministas | Ninguno: dobles deterministas | `c1527bf` | Este documento |

Las 30 evals reales con Groq no forman parte de las evidencias. Para ejecutarlas,
consulta [GROQ-INICIO.md](../GROQ-INICIO.md#prueba-real-y-evals).

## Estado de CI en GitHub

**El workflow `CI` no se ejecuta en GitHub desde el 6 de noviembre de 2026.**
Todos los runs en `main` desde esa fecha, incluido el del commit `ccd40d9`,
terminan como fallidos en unos 3 s. La anotación del job es:

> The job was not started because your account is locked due to a billing issue.

El fallo no proviene del código: el job nunca llega a empezar. La última
ejecución exitosa en `main` es la #25, del 23 de septiembre de 2026. Los
resultados de este documento se obtuvieron ejecutando en local los mismos pasos
que define `.github/workflows/ci.yml`. Para que el *Quality gate* vuelva a
ejecutarse, el propietario del repositorio debe resolver el bloqueo de
facturación de su cuenta de GitHub.

## Revisión de pull requests

Consulta de la API pública de GitHub del 17 de noviembre de 2026: de los **23
pull requests fusionados en `main`, 7 tienen una aprobación registrada** y 16 no
(#1 a #7, #9, #11, #15, #16, #18, #19, #22, #23 y #24). Todos los cambios entraron
mediante PR, pero la regla de «al menos una aprobación» de `AGENTS.md` no se
cumplió en todos.

## Resumen local

| Comando | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Correcto, sin cambios en el lockfile |
| `pnpm lint` | Aprobado |
| `pnpm build` | Aprobado |
| `pnpm typecheck` | Aprobado |
| `pnpm test:coverage` con `REDIS_URL=redis://localhost:6379` | **775 pruebas aprobadas, 0 omitidas, 0 fallidas** |
| `pnpm eval:agent` | 31 de 31 aprobados |
| `pnpm test:widget` | 12 de 12 aprobados, en 3 archivos |
| `pnpm test:compose` | 3 de 3 aprobados |

## Cobertura por paquete

Ejecución con Redis real. Valores de `coverage/coverage-summary.json` de cada
paquete. El umbral mínimo es 80 % en las cuatro métricas.

| Paquete | Pruebas | Líneas | Ramas | Funciones | Statements |
| --- | --- | --- | --- | --- | --- |
| `packages/core` | 25 | 97.5 % | 95.5 % | 96.15 % | 97.5 % |
| `packages/react` | 90 | 98.04 % | 97.1 % | 97.67 % | 98.04 % |
| `packages/embed` | 21 | 97.68 % | 97.22 % | 100 % | 97.68 % |
| `packages/transport-mock` | 7 | 96.36 % | 94.54 % | 100 % | 96.36 % |
| `packages/transport-websocket` | 72 | 99.2 % | 94.97 % | 100 % | 99.2 % |
| `packages/protocol` | 57 | 100 % | 98.55 % | 100 % | 100 % |
| `packages/agent` | 178 | 94.84 % | 89.45 % | 98.21 % | 94.84 % |
| `packages/tmdb` | 90 | 99.58 % | 95.07 % | 100 % | 99.58 % |
| `packages/books` | 36 | 100 % | 98.64 % | 100 % | 100 % |
| `packages/external-api` | 57 | 99.65 % | 95.25 % | 100 % | 99.65 % |
| `apps/api` | 69 | 99.69 % | 96.93 % | 97.29 % | 99.69 % |
| `apps/mcp-server` | 73 | 98.08 % | 95.1 % | 93.93 % | 98.08 % |
| **Total** | **775** | | | | |

`apps/demo` no tiene pruebas unitarias: solo compone APIs públicas ya probadas,
como permite `AGENTS.md`. Pasa lint, typecheck y build.

Respecto de `ccd40d9` hay 169 pruebas más, sobre todo en `packages/agent` (de 82 a
178), por Groq, el estado de conversación y la verificación de respuestas. La
cobertura de ramas de `packages/agent` bajó de 98.54 % a 89.45 %, y sigue por
encima del umbral del 80 %.

## Pruebas con Redis real

Estas pruebas solo se ejecutan si `REDIS_URL` está definida. CI las ejecuta con
un servicio Redis.

| Archivo | Prueba | Qué demuestra |
| --- | --- | --- |
| `apps/api/tests/redis.integration.test.ts` | *restores an authenticated conversation through a second composed API replica* | Una sesión continúa en otra réplica |
| `apps/api/tests/redis.integration.test.ts` | *allows exactly one concurrent owner and rejects stale commits* | El lease admite un solo turno por sesión |
| `packages/external-api/tests/redis.integration.test.ts` | *enforces one shared limit across concurrent replicas* | Las réplicas comparten la cuota |
| `packages/external-api/tests/redis.integration.test.ts` | *keeps independent counters per provider and releases unsent requests* | Contadores por proveedor |
| `packages/external-api/tests/redis.integration.test.ts` | *frees capacity when the sliding window passes* | Ventana deslizante |
| `packages/external-api/tests/redis.integration.test.ts` | *shares cached values across replicas with TTL* | Caché compartida con TTL |

## Integración del widget (`pnpm test:widget`)

`test:widget` compila sus dependencias y ejecuta `apps/api/tests/widget`. Usa el
bundle ESM público de Embed, WebSockets reales y servidores en loopback con
puertos libres. El DOM es jsdom y las ventanas son dobles controlados. No
necesita claves, Ollama ni servicios externos.

| Requisito | Evidencia automatizada |
| --- | --- |
| Sesión y autenticación | Transporte y conexión HTTP y WebSocket en `journey.test.ts` |
| Recomendación y póster | Datos estructurados, texto alternativo y URL validada |
| Comparación con contexto | El segundo turno llega al agente con el historial (comparación simulada) |
| Apertura de IMDb y Google Books | La orden reserva una ventana simulada y la acción validada navega a la URL canónica |
| Aislamiento | Dos widgets reciben credenciales distintas y el segundo no ve el historial del primero |
| Recuperación | Corte del socket tras confirmar un turno; se recupera una única respuesta sin repetir el agente |
| Fallos | El error interno del proveedor se convierte en un error público sin el secreto ficticio |
| Navegación no solicitada | La API rechaza una acción propuesta por un agente comprometido |
| LLM01:2025 | El ataque directo recibe el rechazo del `MovieAgent` real sin llamar al modelo ni al MCP |
| LLM07:2025 | La petición de instrucciones internas no devuelve el marcador interno |
| Metadatos hostiles | Prosa con instrucciones, URL y HTML se renderiza sin ejecutar scripts ni abrir ventanas |
| Póster ausente, popup bloqueado y limpieza | Pruebas de React, `ReferenceNavigator` y ciclo de vida de Embed |
| Créditos TMDB | Logo y aviso oficial en React; atributo `tmdb-credits` |

Estos casos prueban los límites deterministas con el modelo y el MCP
sustituidos. No equivalen a una eval del modelo real.

## Evidencias con servicios reales

| Evidencia | Estado | Documento |
| --- | --- | --- |
| Evals reales con Ollama y MCP | Una ejecución, 25 de 30 casos aprobados | [EVALS.md](../evals/EVALS.md) |
| Dos réplicas con Redis (modo fixture) | Medido | [ESCALABILIDAD.md](../arquitectura/ESCALABILIDAD.md#mediciones) |
| Extremo a extremo con el LLM real, 2 réplicas y proxy | Medido con Ollama sobre `c1527bf`: 8 de 8 turnos correctos, p50 1.18 s, 26 solicitudes a TMDB | [ESCALABILIDAD.md](../arquitectura/ESCALABILIDAD.md#mediciones) |
| Capturas del producto en Chromium con datos reales | 11 capturas; la pestaña de IMDb y CI en verde quedan pendientes | [GUION-DEMO.md](../entrega/GUION-DEMO.md) |
| Consumo del MCP desde un cliente TypeScript y por HTTP | Verificado | [SERVIDOR-MCP.md](../manuales/SERVIDOR-MCP.md#consumo-desde-otros-clientes) |
| `pnpm evidence:tmdb:live` | **Pendiente** | [PROVEEDORES.md](../manuales/PROVEEDORES.md#evidencia-de-uso-real-de-tmdb) |
| Ejemplo de cliente Python del MCP | **Pendiente** | [SERVIDOR-MCP.md](../manuales/SERVIDOR-MCP.md#cliente-python) |

## Ejecución reproducible

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm typecheck
docker compose up -d --wait redis
$env:REDIS_URL = 'redis://localhost:6379'
pnpm test:coverage
pnpm test:widget
pnpm eval:agent
pnpm test:compose
```

## Regresión de fetch

El transporte enlaza el `fetch` nativo a `globalThis`. Así conserva el receptor
que exige el navegador y evita `Illegal invocation` al pedir `/sessions`. Una
prueba de autenticación reproduce esa exigencia.
