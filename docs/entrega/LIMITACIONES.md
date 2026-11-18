# Limitaciones conocidas y trabajo futuro

Este documento reúne lo que la entrega no resuelve, las inconsistencias
detectadas entre el código y la documentación, lo que no se pudo medir y el
trabajo futuro. Las inconsistencias **se documentan y no se corrigen**: el código
de `main` está congelado para la entrega.

Revisado contra el código del commit `ccd40d9`.

## Inconsistencias en el código y la configuración

| # | Inconsistencia | Dónde | Efecto |
| --- | --- | --- | --- |
| 1 | El `SYSTEM_PROMPT` dice «Si no hay herramientas de libros, indica que esa integración está pendiente». Es anterior a la integración de libros | `packages/agent/src/policy.ts` | En la eval I07 el modelo afirmó que la integración de libros estaba pendiente, cuando sí estaba disponible |
| 2 | El caso F09 pregunta si falta alguna integración. Es anterior a la integración de libros | `evals/agent-cases.json` | La pregunta ya no refleja el estado del producto |
| 3 | Los `.env.example` difieren de la guía de arranque (`QUOTA_TMDB`, `GOOGLE_BOOKS_ENABLED`, `QUOTA_GOOGLE_BOOKS`, `SESSION_STORE`, `TURN_TIMEOUT_MS`) | `apps/*/.env.example` | Con los valores de ejemplo el MCP no arranca y no hay libros. Ver [CONFIGURACION.md](../manuales/CONFIGURACION.md#diferencias-entre-envexample-y-la-guía) |
| 4 | `infra/nginx.conf` usa `proxy_read_timeout 90s`, menor que el `TURN_TIMEOUT_MS=180000` de la guía | `infra/nginx.conf` | Detrás del proxy, un turno de más de 90 s sin frames se corta |
| 5 | Compose no declara `TURN_TIMEOUT_MS` | `compose.backend.yaml` | En contenedores el turno dura como máximo 60 s, el valor predeterminado |
| 6 | El Web Component con `websocket-url` crea el transporte con `responseTimeoutMs` de 65 s y no tiene atributo para cambiarlo | `packages/embed/src/AGIChatWidgetElement.ts` | Con turnos de 180 s, el navegador abandona antes que el servidor. La demo no se ve afectada porque inyecta su propio transporte con 185 s |
| 7 | El servidor envía `agent-message` antes de liberar el lease y el contador de turnos | `apps/api/src/server.ts` | Un mensaje enviado justo después de recibir la respuesta puede recibir `busy` (reintentable). Se observó en la medición B |
| 8 | Las instrucciones del servidor MCP solo mencionan las herramientas de películas | `apps/mcp-server/src/server.ts` | Un cliente MCP externo no recibe orientación sobre las herramientas de libros |
| 9 | `evaluateAgent` registra como `unavailable` cualquier error que no sea `AgentError`, incluido su propio límite de 60 s por caso | `packages/agent/src/evaluate.ts` | Un tiempo agotado no se distingue de un servicio caído en los resultados |
| 10 | La demo no activa `showTmdbCredits`, aunque la documentación anterior decía que mostraba los créditos desde el inicio. Se perdió en el rediseño `7a8494e` | `apps/demo/src/main.ts` | Los créditos de TMDB solo aparecen junto a las tarjetas. Una respuesta con datos de TMDB solo en texto no muestra la atribución |
| 11 | **`safeOutput` rechaza respuestas legítimas.** El MCP entrega `tmdb_url`, `reference.url` y `sources` con URLs, y un `content_notice` que dice «datos externos no confiables». El modelo tiende a copiar esas URLs o a parafrasear el aviso. `safeOutput` rechaza cualquier URL y busca la frase del prompt `DATOS EXTERNOS NO CONFIABLES` sin distinguir mayúsculas, así que trata el aviso del propio MCP como una filtración | `packages/agent/src/policy.ts`, `apps/mcp-server/src/tools/` | Muchas consultas legítimas terminan en `policy_denied`. Se comprobó con una traza del agente: «Busca la película Dune de 2021» falla siempre por un enlace a `themoviedb.org` y por el aviso parafraseado. El recorrido de la guía de arranque anterior fallaba por este motivo. Pedir «No escribas enlaces, URLs ni avisos» lo evita en la práctica |
| 12 | **CI no se ejecuta en GitHub desde el 6 de noviembre de 2026.** La anotación del job es *«The job was not started because your account is locked due to a billing issue»*. La última ejecución en verde en `main` es la #25, del 23 de septiembre | Cuenta del propietario del repositorio en GitHub | El *Quality gate* aparece en rojo en todos los PR y pushes recientes, aunque lint, build, typecheck y las 606 pruebas pasan en local. No es un fallo del código |

## Limitaciones del producto

- **No hay despliegue público.** No hay TLS, ni `wss://`, ni un backend
  accesible desde Internet. La demo puede publicarse en Vercel, pero el chat
  necesita un backend público que no existe.
- **Ollama es el cuello de botella.** Es un proceso en un equipo y no se replica
  con la API. Más réplicas de la API no aceleran el modelo.
- **Las cuotas de los proveedores no escalan** con las réplicas.
- **La comparación película–libro solo confirma Dune (2021).** El registro
  `VERIFIED_ADAPTATIONS` tiene un único caso. Para cualquier otra película la
  comparación devuelve `possible_match` o `insufficient_evidence` con veredicto
  `undetermined`.
- **Google Books sin clave puede responder 429.** Durante la preparación de la
  entrega, las consultas anónimas desde el equipo de pruebas devolvieron
  `rate_limited` hasta que se configuró `GOOGLE_BOOKS_API_KEY` (gratuita y sin
  facturación).
- **Calidad del modelo de 4B parámetros.** En las evals reales, 5 de 10 casos
  funcionales fallaron: el modelo pidió aclaraciones en vez de buscar, agregó
  filtros no pedidos o una llamada a herramienta fue rechazada. F04 aprobó las
  verificaciones con una respuesta contradictoria.
- **El modelo a veces responde sin consultar herramientas.** En una prueba, a
  «¿Qué tal es la película Dune de 2021?» respondió con una valoración inventada
  («8.1, más de 15,000 votos») sin llamar a TMDB. La valoración real era 7.8.
- **La pestaña de IMDb no se pudo capturar.** IMDb respondió 403 al navegador
  automatizado. La URL abierta era la correcta
  (`https://www.imdb.com/title/tt1160419/`).
- **Sin streaming.** La respuesta llega completa al final del turno.
- **Riesgo abierto con TMDB.** Sus términos restringen ciertos usos con
  aplicaciones de IA. Debe confirmarse con el docente (ver
  [PROVEEDORES.md](../manuales/PROVEEDORES.md#condiciones-de-la-cuenta)).

## Limitaciones de las evaluaciones

- 30 casos reales y **una sola ejecución**: no hay datos de consistencia.
- Verificaciones mecánicas limitadas, con `requiresHumanReview: true`.
- El dataset real no tiene ataques de varios turnos. La inyección indirecta solo
  se prueba en las evals deterministas.
- El informe no guarda trazas de las herramientas, así que no se sabe qué causó
  los fallos F01 y F05.
- La revisión de las respuestas la asistió Claude Code y está **pendiente de
  confirmación del equipo**.
- Un resultado favorable no garantiza inmunidad ante ataques nuevos.

## Lo que no se pudo medir o verificar

| Elemento | Motivo | Cómo completarlo |
| --- | --- | --- |
| `pnpm evidence:tmdb:live` | No se ejecutó para esta entrega | Ver [PROVEEDORES.md](../manuales/PROVEEDORES.md#evidencia-de-uso-real-de-tmdb) |
| Ejemplo de cliente Python del MCP | No se ejecutó | `pip install mcp` y ejecutar el ejemplo de [SERVIDOR-MCP.md](../manuales/SERVIDOR-MCP.md#cliente-python) |
| Condiciones de la cuenta de TMDB | Requieren a una persona del equipo en la cuenta | Completar la tabla de [PROVEEDORES.md](../manuales/PROVEEDORES.md#condiciones-de-la-cuenta) |
| Compatibilidad entre navegadores | Solo se probó Chromium | Repetir el guion en Firefox y Safari |
| Captura de la pestaña de IMDb (`05-abrir-imdb-pestana.png`) | IMDb respondió 403 al navegador automatizado | Tomarla a mano en un navegador normal siguiendo [GUION-DEMO.md](./GUION-DEMO.md) |
| Captura de CI en verde (`12-ci-verde.png`) | CI no se ejecuta por el bloqueo de facturación | Resolver el bloqueo, volver a ejecutar CI y capturar la página de Actions |
| Solicitudes consumidas en TMDB y Google Books durante la medición C | El MCP usaba `SHARED_STORE=memory` | Repetir con `SHARED_STORE=redis` y leer `agichat:quota:*` |
| Carga con el modelo real a gran escala | Ollama local no lo permite | Requiere varias instancias de LLM |

## Trabajo futuro

- Resolver el bloqueo de facturación de la cuenta de GitHub para que CI vuelva a
  ejecutarse.
- Que `safeOutput` distinga el aviso del MCP de una filtración del prompt, o que
  el MCP no envíe URLs al modelo y las referencias viajen solo por campos
  estructurados.
- Actualizar el `SYSTEM_PROMPT` y el caso F09 a la integración de libros.
- Alinear `proxy_read_timeout`, `TURN_TIMEOUT_MS` en Compose y la espera del Web
  Component.
- Liberar el lease antes de enviar `agent-message`, o documentar en el cliente que
  debe reintentar `busy`.
- Ampliar `VERIFIED_ADAPTATIONS` con más adaptaciones y fuentes revisadas.
- Guardar trazas de herramientas en el informe de las evals y repetir varias
  ejecuciones para medir la consistencia.
- Agregar ataques de varios turnos e inyección indirecta con metadatos reales al
  dataset.
- Despliegue público con TLS, Redis administrado y un LLM escalable detrás de
  `LanguageModel`.
- Separar los dominios en varios servidores MCP si crecen sus herramientas.
- Un orquestador con subagentes de películas y libros (arquitectura jerárquica),
  si cada dominio necesitara su propio razonamiento.
- Streaming de tokens en el protocolo.
