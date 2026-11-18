# Escalabilidad

Este documento explica qué partes de AGIChat se replican, dónde vive el estado,
qué no escala y qué se midió. La vista general está en
[ALTO-NIVEL.md](./ALTO-NIVEL.md).

Revisado contra el código del commit `ccd40d9`.

## 1. Qué se replica

| Componente | ¿Se replica? | Condición | Por qué funciona |
| --- | --- | --- | --- |
| API (`apps/api`) | Sí | `SESSION_STORE=redis` en **todas** las réplicas | Sesiones, turnos y leases viven en Redis. En memoria solo quedan los sockets abiertos y los contadores locales de límites |
| Servidor MCP (`apps/mcp-server`) | Sí | `SHARED_STORE=redis` | Transporte sin sesión: cada `POST /mcp` crea su propia instancia. Caché y cuotas viven en Redis |
| Ollama | No en esta entrega | — | Un proceso en un equipo |
| Redis | No en esta entrega | — | Una instancia local |

Con `SHARED_STORE=redis`, el MCP no guarda caché ni cuotas en memoria: usa
`RedisCacheStore` y `RedisQuotaStore` (`apps/mcp-server/src/app.ts`). Con
`memory`, el servidor registra la advertencia *«Quotas and cache are not shared
between replicas»*.

## 2. Dónde vive el estado

| Dato | Almacenamiento | Clave en Redis | TTL | Quién lo escribe |
| --- | --- | --- | --- | --- |
| Sesión y hash SHA-256 del token | Redis | `agichat:chat:{<sessionId>}` | `SESSION_TTL_MS` (30 min), renovado en cada turno | API, al crear la sesión |
| Turnos confirmados (últimos 20, para historial e idempotencia) | Redis, dentro de la sesión | Misma clave | El de la sesión | API, en `commit` |
| Lease del turno en curso | Redis | `agichat:chat:{<sessionId>}:lock` | `TURN_TIMEOUT_MS` + 5 s | API, en `acquire`; se borra en `release` |
| Caché de TMDB | Redis | `agichat:cache:…` | 24 h detalles, géneros e IDs externos; 15 min búsquedas y discover | MCP |
| Caché de Google Books | Redis | `agichat:cache:google-books:v1…` | 1 h | MCP |
| Contadores de cuota | Redis | `agichat:quota:<proveedor>:<ventana>` | Duración de la ventana | MCP, con reservas atómicas en Lua |
| Socket WebSocket abierto | Memoria de la réplica | — | Mientras dure la conexión | API |
| Credenciales de la sesión en el cliente | Memoria del navegador | — | Mientras viva el transporte | Widget |

Las claves de sesión usan un *hash tag* (`{…}`) para que la sesión y su lease
caigan en el mismo slot si se usa Redis Cluster.

## 3. Conexiones y reconexión

- Un WebSocket pertenece a una réplica mientras está abierto. El proxy reparte
  las conexiones nuevas entre réplicas (round-robin en `infra/nginx.conf`).
- Al reconectar, la sesión se recupera desde Redis **en cualquier réplica**. Por
  eso no hacen falta sesiones pegajosas (*sticky sessions*).
- El lease es atómico en Redis. Aunque una sesión tenga dos conexiones en dos
  réplicas, solo una puede ejecutar un turno a la vez; la otra recibe `busy`.
- `commit` verifica que el dueño del lease siga siendo el mismo. Una réplica que
  perdió el lease no puede escribir un turno viejo.
- Si Redis cae, la API falla de forma cerrada: responde `unavailable` y no crea
  sesiones locales.

## 4. Caché y cuotas compartidas

- Las cuotas se reservan con operaciones atómicas en Redis antes de cada
  solicitud. Dos réplicas del MCP **no duplican** el presupuesto diario.
- **Las cuotas de TMDB y Google Books no aumentan al agregar réplicas.** El
  límite es el mismo para todo el sistema.
- La caché compartida reduce el consumo: una búsqueda repetida en cualquier
  réplica no gasta cuota mientras dure su TTL.
- Si Redis no responde, la cuota no se puede verificar y la solicitud **no se
  envía** (`quota_unavailable`).

El detalle está en [CACHE-Y-CUOTAS.md](./CACHE-Y-CUOTAS.md).

## 5. Cuellos de botella y límites

| Cuello de botella | Efecto | Mitigación actual |
| --- | --- | --- |
| Ollama: un proceso en un equipo | Todas las réplicas comparten la misma GPU; las peticiones simultáneas compiten | `MAX_CONCURRENT_TURNS` limita la presión por réplica |
| Cuotas diarias de los proveedores | Un tope fijo de solicitudes, sin importar las réplicas | Caché compartida y reservas atómicas |
| `MAX_CONCURRENT_TURNS` (4) y `MAX_CONNECTIONS` (64) | Son **por réplica**: su suma crece con cada réplica | Ajustar la suma a la capacidad del modelo |
| `proxy_read_timeout 90s` en `infra/nginx.conf` | Un turno de más de 90 s sin frames se corta detrás del proxy | Ninguna: ver [LIMITACIONES.md](../entrega/LIMITACIONES.md) |

Fórmula simple de capacidad:

```text
turnos simultáneos = réplicas × MAX_CONCURRENT_TURNS
                   limitado por los turnos que el modelo puede atender a la vez
```

Ejemplo: 2 réplicas × 4 = 8 turnos simultáneos admitidos por la API. Si un
único Ollama solo atiende bien 1 o 2 peticiones a la vez, el resto espera en
Ollama y aumenta la latencia. Agregar réplicas de la API **no** acelera al
modelo.

No hay cola de espera. Cuando una réplica está llena, responde `busy`, que es
reintentable.

## 6. Cómo escalar en producción (trabajo futuro, no implementado)

- TLS y `wss://` en el balanceador, con `proxy_read_timeout` mayor que
  `TURN_TIMEOUT_MS`.
- Redis administrado, con contraseña, TLS y alta disponibilidad.
- Varias instancias de LLM o un proveedor en la nube detrás del puerto
  `LanguageModel`. Basta con otro adaptador como `OllamaModel`.
- Varias réplicas del servidor MCP detrás de su propio balanceador, con
  `SHARED_STORE=redis` y `MCP_ALLOWED_HOSTS`.
- Ajustar `MAX_CONCURRENT_TURNS` según la capacidad medida del modelo.
- Monitoreo de latencia, errores `busy` y consumo de cuotas.

## Mediciones

Fecha: 17 de noviembre de 2026. Commit: `ccd40d9`. Equipo: Windows 11, AMD
Ryzen 7 260 (8 núcleos y 16 hilos), 15.3 GB de RAM, NVIDIA GeForce RTX 5050
Laptop GPU. Los scripts se ejecutaron desde una carpeta temporal fuera del
repositorio y se borraron al terminar.

### A. Pruebas automatizadas con Redis real

`pnpm test:coverage` con `REDIS_URL=redis://localhost:6379`: 606 pruebas
aprobadas, incluidas las 6 de integración con Redis. Las que demuestran el
comportamiento entre réplicas están en
[VERIFICACION.md](../calidad/VERIFICACION.md#pruebas-con-redis-real).

### B. Dos réplicas en modo fixture

**Estas mediciones evalúan la infraestructura (API, WebSocket y Redis), no al
LLM.** El modelo y las herramientas son dobles deterministas
(`AGENT_MODE=fixture`, `TOOLS_MODE=fixture`), así que no se consumió cuota.

Configuración: Redis 7.4 en Docker y dos procesos de la API con
`SESSION_STORE=redis`, puertos 8000 y 8002, `MAX_CONCURRENT_TURNS=4` y
`MAX_CONNECTIONS=64`. Salida de los procesos al iniciar:

```text
[replica 8000] {"event":"chat_listening","host":"127.0.0.1","port":8000,"mode":"fixture","sessions":"redis"}
[replica 8002] {"event":"chat_listening","host":"127.0.0.1","port":8002,"mode":"fixture","sessions":"redis"}
```

| Prueba | Procedimiento | Resultado |
| --- | --- | --- |
| Carga | 20 sesiones creadas en una réplica y autenticadas en la otra; 5 rondas de 20 turnos concurrentes (100 turnos) | 38 exitosos y 62 `busy`; 0 errores distintos de `busy` |
| Latencia de los turnos exitosos | Desde el envío hasta `agent-message` | p50 5.4 ms, p95 11.6 ms, máximo 11.6 ms |
| Aislamiento | Sesión A en la réplica 8000 y continuada en la 8002; sesión B en la 8002 | A guardó `["Mensaje A1","Mensaje A2"]` y B `["Mensaje B1"]`. Sin mezcla de historiales |
| Idempotencia entre réplicas | Reenvío desde la 8002 del `requestId` confirmado en la 8000 | Devolvió el mismo `message.id`, sin repetir el agente y con `actions` vacío |
| Lease | 20 intentos con dos conexiones de la misma sesión, una por réplica, enviando a la vez | 20 de 20: un turno exitoso y el otro `busy` |
| Reconexión | Turno en la 8000, se detiene esa réplica y se reconecta a la 8002 | La sesión continuó; historial `["Antes de la caída","Después de la caída"]` |

Interpretación:

- Los 62 `busy` son el comportamiento esperado. Con 20 turnos simultáneos y
  2 × 4 = 8 plazas, la API rechaza el exceso en vez de encolarlo.
- La latencia de milisegundos corresponde solo a la infraestructura. Con el
  modelo real, el tiempo lo domina Ollama (ver C).
- Se observó una carrera: el servidor envía `agent-message` antes de liberar el
  lease, así que un mensaje enviado justo después en la misma sesión puede
  recibir `busy`. Está documentado en [LIMITACIONES.md](../entrega/LIMITACIONES.md).

### C. Extremo a extremo con el LLM real

Configuración:

- Dos procesos de la API en los puertos 8000 y 8002, con `SESSION_STORE=redis`,
  `AGENT_MODE=ollama`, `TOOLS_MODE=mcp` y `TURN_TIMEOUT_MS=180000`.
- Un contenedor `nginx:1.28-alpine` en el puerto 8080 con una copia temporal de
  `infra/nginx.conf`. Solo cambian los upstreams, que apuntan a las réplicas del
  anfitrión (`host.docker.internal:8000` y `:8002`).
- Ollama 0.40.16 con `qwen3:4b-instruct-2507-q4_K_M` al 100 % en GPU, y el
  servidor MCP real con TMDB y Google Books.
- Cada turno usa una sesión nueva. La latencia se mide desde el envío del
  mensaje hasta `agent-message` o `error`.

```text
[replica 8000] {"event":"chat_listening","host":"127.0.0.1","port":8000,"mode":"ollama","sessions":"redis"}
[replica 8002] {"event":"chat_listening","host":"127.0.0.1","port":8002,"mode":"ollama","sessions":"redis"}
```

| Modo | Mensaje | Latencia | Resultado | Tarjetas |
| --- | --- | --- | --- | --- |
| Secuencial | Hola, ¿qué puedes hacer? | 1.05 s | Correcto | 0 |
| Secuencial | Quiero ver Dune (2021). Dame su año, géneros y valoración en una lista corta | 2.71 s | Correcto | 5 |
| Secuencial | Recomiéndame una película de ciencia ficción | 6.59 s | Correcto | 5 |
| Secuencial | Recomiéndame una comedia sin spoilers | 5.50 s | Correcto | 5 |
| Secuencial | Quiero ver Alien (1979). Dame su año, géneros y valoración en una lista corta | 3.64 s | Correcto | 5 |
| 3 a la vez | Recomiéndame una película de drama | 28.82 s | `policy_denied` | 0 |
| 3 a la vez | Recomiéndame una película de animación | 37.80 s | `policy_denied` | 0 |
| 3 a la vez | Quiero ver Interstellar (2014). Dame su año, géneros y valoración en una lista corta | 17.55 s | Correcto | 4 |

| Métrica | Valor |
| --- | --- |
| Turnos | 8 (6 correctos y 2 `policy_denied`) |
| p50 de los turnos correctos | 3.64 s |
| p95 de los turnos correctos | 17.55 s |
| p50 secuencial | 3.64 s |
| Latencia con 3 turnos a la vez | Entre 17.6 y 37.8 s |
| Errores de infraestructura (`busy`, `timeout`, `unavailable`) | 0 |

Interpretación:

- Con un turno a la vez, la mayoría de las respuestas llegan en menos de 7 s.
- Con tres turnos simultáneos, la latencia se multiplica por 5 a 10, aunque la
  API tenía plazas libres (2 réplicas × 4). **El cuello de botella es Ollama**,
  no la API ni Redis.
- Los dos `policy_denied` no son fallos de infraestructura. Los produce
  `safeOutput` cuando el modelo incluye URLs o parafrasea el aviso de datos
  externos (ver [LIMITACIONES.md](../entrega/LIMITACIONES.md)).

**No se pudo medir** cuántas solicitudes llegaron a TMDB y Google Books. El
servidor MCP de esta prueba usaba `SHARED_STORE=memory`, así que sus contadores
de cuota viven en la memoria del proceso y no en Redis. Para medirlo, ejecuta el
MCP con `SHARED_STORE=redis` y consulta las claves `agichat:quota:*` antes y
después de la prueba.
