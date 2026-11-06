# Política de cuotas y caché para APIs externas

`@agichat/external-api` concentra el control de cuotas, los reintentos y la
caché que comparten todas las integraciones externas. TMDB ya lo utiliza; esta
guía explica cómo reutilizarlo desde otro cliente, por ejemplo Google Books,
sin duplicar la implementación.

## Conceptos

| Concepto | Descripción |
| --- | --- |
| Proveedor | Identificador del servicio externo (`tmdb`, `google_books`). Cada proveedor tiene contadores propios. |
| Ventana | Límite deslizante: como máximo `limit` solicitudes en `windowMs` milisegundos. |
| Política | Lista de ventanas de un proveedor. Una solicitud se permite solo si **todas** tienen cupo. |
| Lease | Registro de una solicitud. Se crea antes de enviarla y solo se devuelve si nunca llegó al proveedor. |
| Store | Almacenamiento de contadores: `RedisQuotaStore` (varias réplicas) o `InMemoryQuotaStore` (pruebas o una sola réplica). |

## Interfaz pública

```ts
class QuotaManager {
  constructor(options: {
    store: QuotaStore;
    policies: Record<string, { windows: { limit: number; windowMs: number }[] }>;
    onEvent?: (event: QuotaEvent) => void; // métricas y depuración
  });
  acquire(provider: string): Promise<QuotaLease>;      // registra una solicitud
  usage(provider: string): Promise<ProviderQuotaUsage>; // consulta sin registrar
}

createQuotaFetch(fetch, quota, provider): FetchLike;   // cuenta cada intento
createRetryFetch(fetch, retryOptions?): FetchLike;      // reintentos con backoff
createResilientFetch({ provider, quota, fetch?, retry? }): FetchLike; // ambos, en el orden correcto
```

### Registrar una llamada

Lo habitual es no llamar a `acquire` directamente, sino usar
`createResilientFetch` como transporte del cliente. Cada intento HTTP pasa por
la cuota:

```ts
const tmdbFetch = createResilientFetch({ provider: "tmdb", quota });
const response = await tmdbFetch(url, { headers });
```

Si se necesita control manual, por ejemplo con un SDK que no acepta `fetch`:

```ts
const lease = await quota.acquire("google_books"); // lanza QuotaExceededError si no hay cupo
try {
  await sdk.call();
} catch (error) {
  if (isRequestNotSent(error)) {
    await lease.release(); // la conexión nunca se estableció
  }
  throw error;
}
```

### Consultar disponibilidad

```ts
const usage = await quota.usage("google_books");
// { provider: "google_books", available: true,
//   windows: [{ limit: 1000, windowMs: 86400000, used: 12, remaining: 988 }] }
```

## Reglas de contabilización

| Situación | ¿Cuenta? |
| --- | --- |
| Solicitud enviada con respuesta 2xx, 4xx o 5xx | Sí |
| Cada reintento que genera una nueva solicitud | Sí (cada intento llama a `acquire`) |
| Timeout o `ECONNRESET` después de conectar | Sí: pudo haber llegado al proveedor |
| `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `ENETUNREACH`, `EHOSTUNREACH`, `UND_ERR_CONNECT_TIMEOUT` | No: se devuelve el cupo |
| Solicitud bloqueada por cuota agotada | No: ni se envía ni se registra |
| Solicitud con `AbortSignal` ya cancelado | No |
| Resultado servido desde la caché | No: no hay solicitud externa |

Cuando no puede demostrarse que la solicitud no se envió, se considera enviada.
Es preferible subestimar el cupo disponible que superar el límite real.

## Configuración de límites

Los límites se leen de variables `QUOTA_<PROVEEDOR>` con el formato
`cantidad/duración`, separadas por comas. Unidades: `ms`, `s`, `m`, `h` y `d`.

```bash
# Valores ficticios que solo ilustran el formato; no son límites reales.
QUOTA_TMDB=5/1s
QUOTA_GOOGLE_BOOKS=30/1m,300/1d
```

```ts
const quota = new QuotaManager({
  store: new RedisQuotaStore(redis),
  policies: quotaPoliciesFromEnv(process.env, ["tmdb", "google_books"])
});
```

**No hay valores por defecto.** Si falta la variable de un proveedor, se lanza
`QuotaConfigurationError` al iniciar. Los límites deben tomarse de las
condiciones vigentes de cada servicio (la consola de Google Cloud en el caso de
Google Books) o de la consigna del curso; no se deben estimar.

## Almacenamiento compartido entre réplicas

`RedisQuotaStore` guarda cada ventana en un sorted set
`agichat:quota:<proveedor>:<windowMs>`, donde cada miembro es el ID de una
solicitud y su score es el instante en que se registró.

- La verificación y el registro ocurren dentro de un único script Lua, que Redis
  ejecuta de forma atómica. Dos réplicas no pueden tomar el último cupo a la vez.
- La hora se obtiene de Redis (`TIME`) y no del reloj de cada réplica.
- Cada clave expira sola cuando termina su ventana más reciente.
- Proveedores distintos usan claves distintas, por lo que sus contadores nunca se
  mezclan.

`RedisQuotaStore` recibe cualquier cliente compatible con `RedisLike`; un
`Redis` de `ioredis` sirve directamente.

## Cuota agotada o almacenamiento caído

| Error | Cuándo ocurre | Qué hacer |
| --- | --- | --- |
| `QuotaExceededError` | No queda cupo en alguna ventana. Incluye `retryAfterMs` y el uso de cada ventana. | Informar al usuario o esperar `retryAfterMs`. Los reintentos automáticos se detienen. |
| `QuotaUnavailableError` | No se pudo consultar Redis. | La política falla de forma cerrada: no se llama al proveedor. |
| `QuotaConfigurationError` | Proveedor sin política o con límites inválidos. | Corregir la configuración. |

En TMDB, estos errores se traducen a `TmdbError` con códigos `quota_exhausted` y
`quota_unavailable`. Conviene que Google Books haga lo mismo con sus propios
errores tipados.

## Reintentos

`createRetryFetch` reintenta respuestas 429, 500, 502, 503 y 504 y los fallos de
red, con un máximo de intentos.

- Valores por defecto: 3 intentos, backoff exponencial con jitter completo desde
  250 ms y un tope de 4 s por espera.
- Respeta `Retry-After`. Si pide esperar más de 10 s, devuelve la respuesta sin
  reintentar.
- No reintenta cancelaciones ni errores de cuota.

## Caché

```ts
const cache = new ReadThroughCache(new RedisCacheStore(redis));
const value = await cache.getOrLoad(
  buildCacheKey("google_books:v1", "search", { q, page }),
  () => loadFromApi(q, page),
  { ttlMs: 15 * 60_000, shouldCache: (result) => result.complete }
);
```

- Las claves usan `<namespace>:<operación>:<parámetros canónicos>`. Los
  parámetros se ordenan y se omiten los `undefined`, por lo que dos consultas
  equivalentes producen la misma clave.
- No se guardan errores. `shouldCache` permite descartar resultados degradados.
- Las solicitudes concurrentes con la misma clave dentro de una réplica comparten
  una sola carga.
- Si la caché falla, la carga se ejecuta igual: la caché nunca impide responder.
- **Invalidación:** los valores expiran por TTL. Para forzar una actualización,
  usar `cache.invalidate(clave)` o `cache.invalidatePrefix("google_books:v1:")`.
  Si cambia la forma del resultado, incrementar la versión del namespace
  (`v1` a `v2`) deja obsoletas todas las claves anteriores.

## Ejemplo de integración con otro cliente

Ejemplo ilustrativo de cómo un cliente de Google Books podría componer estas
piezas. La implementación de Google Books no forma parte de este paquete.

```ts
import {
  QuotaManager,
  RedisQuotaStore,
  ReadThroughCache,
  RedisCacheStore,
  buildCacheKey,
  createResilientFetch,
  quotaPoliciesFromEnv
} from "@agichat/external-api";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const quota = new QuotaManager({
  store: new RedisQuotaStore(redis),
  policies: quotaPoliciesFromEnv(process.env, ["tmdb", "google_books"])
});

const booksFetch = createResilientFetch({ provider: "google_books", quota });
const cache = new ReadThroughCache(new RedisCacheStore(redis));

export function searchBooks(q: string) {
  return cache.getOrLoad(
    buildCacheKey("google_books:v1", "volumes", { q }),
    async () => {
      const url = new URL("https://www.googleapis.com/books/v1/volumes");
      url.searchParams.set("q", q);
      const response = await booksFetch(url.toString(), {});
      if (!response.ok) {
        throw new Error(`Google Books responded with HTTP ${response.status}`);
      }
      return response.json();
    },
    { ttlMs: 15 * 60_000 }
  );
}
```

Para las pruebas, `InMemoryQuotaStore` e `InMemoryCacheStore` tienen la misma
semántica y aceptan un reloj inyectable (`now`).

## Pruebas con Redis real

```bash
docker compose up -d --wait redis
REDIS_URL=redis://localhost:6379 pnpm --filter @agichat/external-api test
```

Sin `REDIS_URL`, las pruebas de integración se omiten. En CI, el job
`Quality gate` levanta Redis y las ejecuta siempre.
