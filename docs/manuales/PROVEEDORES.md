# Manual de proveedores externos

AGIChat consulta dos proveedores de datos: **TMDB** para películas y **Google
Books** para libros. Este manual explica cómo configurar cada cuenta sin
registrar tarjetas de crédito, qué cuotas usa el proyecto, qué atribución exige
cada proveedor y cómo obtener evidencia de uso real.

Las condiciones de los proveedores pueden cambiar. Confírmalas en su
documentación oficial antes de cada entrega.

## Resumen

| Proveedor | Uso en AGIChat | Credencial | Tarjeta de crédito | Cuota del proyecto |
| --- | --- | --- | --- | --- |
| TMDB | Búsqueda, detalles, pósteres e IMDb | Token de lectura v4 (obligatorio) | No se registró | `QUOTA_TMDB=1000/1d` |
| Google Books | Búsqueda y detalles de libros | Clave opcional | No se registró | `QUOTA_GOOGLE_BOOKS=5/1s,1000/1d` |

Las credenciales viven solo en `apps/mcp-server/.env`, que Git ignora. El
navegador nunca recibe una credencial: el widget habla con la API y solo el
servidor MCP consulta a los proveedores.

## TMDB

### Crear la credencial

1. Crea una cuenta en `https://www.themoviedb.org` y verifica el correo.
2. Entra en **Settings → API** y solicita una clave de uso **no comercial**.
3. En la solicitud, describe la aplicación como un proyecto académico de
   estudiantes del curso **CC3116 de la Universidad del Valle de Guatemala**,
   sin ingresos, anuncios ni suscripciones.
4. Cuando se apruebe, copia el **API Read Access Token**. Es el token largo que
   empieza por `eyJ`. No uses la *API Key* corta.
5. Pega el token en `apps/mcp-server/.env` como `TMDB_READ_ACCESS_TOKEN`.

No se agregaron capturas de la cuenta de TMDB porque contienen datos personales
de la cuenta.

### Atribución

TMDB exige mostrar su logo y este aviso, en inglés y sin modificar:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

El componente `packages/react/src/components/TmdbCredits.tsx` muestra el logo
oficial sin modificar (`tmdbLogo.ts`, copiado en
[`docs/assets/tmdb-logo.svg`](../assets/tmdb-logo.svg)) junto al aviso. El
widget lo muestra cuando hay tarjetas de recomendación o cuando se activa
`showTmdbCredits` (atributo `tmdb-credits` del Web Component). La demo actual
no activa `showTmdbCredits`, así que los créditos aparecen junto a las tarjetas
de recomendación.

- [Requisitos oficiales de atribución](https://developer.themoviedb.org/docs/faq)
- [Logo original](https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg)

### Uso comercial

AGIChat se usa con fines académicos. Una venta o un uso comercial del producto
exigiría revisar y contratar la licencia comercial de TMDB, según su
[FAQ](https://developer.themoviedb.org/docs/faq) y sus
[términos de uso de la API](https://www.themoviedb.org/api-terms-of-use).

### Valor de `QUOTA_TMDB`

`QUOTA_TMDB` es el límite que el servidor se impone a sí mismo. Todas las
réplicas lo comparten mediante Redis. Debe ser **igual o menor** que el límite
vigente de TMDB. Si la consigna del curso fija un presupuesto menor, prevalece
el menor.

- Valor usado en la demo: `1000/1d`.
- Origen: presupuesto del equipo definido en la guía de arranque.

## Google Books

### Acceso sin tarjeta

Google Books permite consultar **metadatos públicos** de volúmenes sin clave.
AGIChat funciona con `GOOGLE_BOOKS_API_KEY` vacío. No se creó un proyecto con
facturación ni se registró una tarjeta.

Si el proveedor exige identificar las consultas, crea una clave de API en un
proyecto de Google Cloud **sin activar la facturación**, restríngela a la Books
API y colócala en `GOOGLE_BOOKS_API_KEY`. La clave permanece dentro del cliente
HTTP del servidor. No aparece en resultados, errores ni claves de caché.

Referencia: [documentación oficial de acceso a datos públicos](https://developers.google.com/books/docs/v1/using).

### Configuración

En `apps/mcp-server/.env`:

```dotenv
GOOGLE_BOOKS_ENABLED=true
QUOTA_GOOGLE_BOOKS=5/1s,1000/1d
GOOGLE_BOOKS_API_KEY=
GOOGLE_BOOKS_TIMEOUT_MS=8000
```

Libros está **deshabilitado por defecto**. Al habilitarlo, `QUOTA_GOOGLE_BOOKS`
es obligatoria. El contador `google-books` es independiente del de `tmdb`, y la
caché de libros dura una hora.

### Crédito

Los datos de libros provienen de **Google Books**. Las referencias se abren en
`https://books.google.com/books?id=<id>`, construidas a partir del identificador
del volumen. No se confía en enlaces recibidos del proveedor.

### Comparación película–libro

La comparación no depende solo de Google Books. Un registro revisado en el
servidor (`VERIFIED_ADAPTATIONS` en `packages/books/src/comparison.ts`) confirma
qué película adapta qué libro. Hoy contiene **solo Dune (2021), basada en Dune
de Frank Herbert (1965)**. Para cualquier otra película, la comparación devuelve
`possible_match` o `insufficient_evidence` con veredicto `undetermined`. Ver
[LIMITACIONES.md](../entrega/LIMITACIONES.md).

## Evidencia de uso real de TMDB

Las pruebas automatizadas usan un TMDB simulado
([ESCENARIOS-TMDB.md](../evals/ESCENARIOS-TMDB.md)). El script de evidencia
consulta TMDB a través del MCP en ejecución. No lee el token ni lo escribe en
el reporte.

```powershell
# Terminal 1: servidor con credenciales reales en apps/mcp-server/.env
docker compose up -d --wait redis
pnpm dev:mcp

# Terminal 2
$env:RUN_LIVE_TMDB = '1'
pnpm evidence:tmdb:live
```

```bash
RUN_LIVE_TMDB=1 pnpm evidence:tmdb:live
```

Casos: búsqueda exacta (`Inception`, 2010), título ambiguo (`La casa`),
detalles con IMDb (ID 27205), candidatos por género y año, y una búsqueda sin
resultados. Cada caso consume cuota de TMDB.

El reporte se guarda en `evals/results/tmdb-live-<fecha>.json`, que no se
versiona. Incluye fecha, herramientas expuestas, argumentos, duración, código de
error y un resumen de cada respuesta.

**Pendiente:** este script no se ejecutó para esta entrega. Para hacerlo, sigue
los pasos anteriores y copia el JSON revisado a `docs/evals/resultados/`.

## Condiciones de la cuenta

Cada dato de esta tabla lo confirma una persona del equipo en la cuenta o en la
documentación oficial vigente. No se debe llenar con estimaciones.

| Dato | Dónde se confirma | Valor confirmado | Fecha y responsable |
| --- | --- | --- | --- |
| Tipo de uso declarado (educativo, no comercial) | themoviedb.org → Settings → API | **Pendiente** | |
| Descripción de la aplicación (proyecto académico CC3116, UVG) | themoviedb.org → Settings → API | **Pendiente** | |
| El proyecto no genera ingresos | Decisión del equipo | **Pendiente** | |
| Límite de solicitudes vigente de TMDB | [Rate limiting](https://developer.themoviedb.org/docs/rate-limiting) | **Pendiente** | |
| Requisitos de atribución | [FAQ](https://developer.themoviedb.org/docs/faq) | Implementados en `TmdbCredits.tsx` | |
| Uso con aplicaciones de IA o chatbots permitido para este proyecto | [Términos de la API](https://www.themoviedb.org/api-terms-of-use) y docente | **Pendiente** | |

La última fila es un riesgo abierto. Los términos de la API restringen ciertos
usos con aplicaciones de IA, y debe confirmarse con el docente antes de la
entrega.
