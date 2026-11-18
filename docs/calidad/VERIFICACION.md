# Verificación y evidencias de calidad

Este informe reúne los resultados de las validaciones automatizadas y separa lo
verificado de lo que sigue pendiente. Cada número sale de un comando ejecutado.

## Contexto de la ejecución

| Dato | Valor |
| --- | --- |
| Fecha | 17 de noviembre de 2026 |
| Commit | `ccd40d9` (rama `docs/documentacion`, sin cambios de código) |
| Sistema | Windows 11 Home Single Language 10.0.26200 |
| CPU | AMD Ryzen 7 260 w/ Radeon 780M Graphics, 8 núcleos y 16 hilos |
| RAM | 15.3 GB |
| GPU | NVIDIA GeForce RTX 5050 Laptop GPU y AMD Radeon 780M Graphics |
| Node.js | 24.19.0 (CI usa Node 22) |
| pnpm | 11.19.0 |
| Docker | 29.8.2 |
| Ollama | 0.40.16 |
| Redis | `redis:7.4-alpine` de `compose.yaml` |

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
| `pnpm test:coverage` con `REDIS_URL=redis://localhost:6379` | **606 pruebas aprobadas, 0 omitidas, 0 fallidas** |
| `pnpm test:coverage` sin Redis | 600 aprobadas y 6 omitidas (las de integración con Redis) |
| `pnpm eval:agent` | 31 de 31 aprobados |
| `pnpm test:widget` | 9 de 9 aprobados, en 3 archivos |
| `pnpm test:compose` | 3 de 3 aprobados |

## Cobertura por paquete

Ejecución con Redis real. Valores de `coverage/coverage-summary.json` de cada
paquete. El umbral mínimo es 80 % en las cuatro métricas.

| Paquete | Pruebas | Líneas | Ramas | Funciones | Statements |
| --- | --- | --- | --- | --- | --- |
| `packages/core` | 25 | 97.5 % | 95.5 % | 96.15 % | 97.5 % |
| `packages/react` | 84 | 98.02 % | 97.07 % | 97.67 % | 98.02 % |
| `packages/embed` | 19 | 97.68 % | 97.14 % | 100 % | 97.68 % |
| `packages/transport-mock` | 7 | 96.36 % | 94.54 % | 100 % | 96.36 % |
| `packages/transport-websocket` | 72 | 99.2 % | 94.97 % | 100 % | 99.2 % |
| `packages/protocol` | 36 | 100 % | 100 % | 100 % | 100 % |
| `packages/agent` | 82 | 100 % | 98.54 % | 94.73 % | 100 % |
| `packages/tmdb` | 84 | 99.58 % | 94.74 % | 100 % | 99.58 % |
| `packages/books` | 20 | 100 % | 98.31 % | 100 % | 100 % |
| `packages/external-api` | 57 | 99.65 % | 95.25 % | 100 % | 99.65 % |
| `apps/api` | 54 | 100 % | 96.46 % | 100 % | 100 % |
| `apps/mcp-server` | 66 | 98.59 % | 95.62 % | 93.93 % | 98.59 % |
| **Total** | **606** | | | | |

`apps/demo` no tiene pruebas unitarias: solo compone APIs públicas ya probadas,
como permite `AGENTS.md`. Pasa lint, typecheck y build.

Sin Redis, las ramas de `apps/api` bajan a 94.17 %, porque no se ejecutan las
pruebas de integración. El resto de las métricas no cambia de forma relevante.

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
| Extremo a extremo con el LLM real, 2 réplicas y proxy | Medido: 8 turnos, p50 3.64 s | [ESCALABILIDAD.md](../arquitectura/ESCALABILIDAD.md#mediciones) |
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
