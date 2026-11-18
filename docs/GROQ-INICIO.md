# Inicio con Groq

Groq sustituye únicamente la inferencia local de Ollama. La API conserva la
validación de herramientas, el cliente MCP, las sesiones y los controles del
agente. Las herramientas se ejecutan en el backend, no en los servidores de Groq.
El frontend recibe `mode: "groq"`; reconstruir también la demo al actualizar.

## Configuración

Crear una clave en <https://console.groq.com/keys>, conservando el plan gratuito
y sin agregar tarjeta, según la consigna del curso. Consultar los modelos y
cuotas disponibles en la cuenta antes de la demostración. El modelo inicial
configurado es `openai/gpt-oss-20b`, intercambiable mediante `GROQ_MODEL`.

En `apps/api/.env` (ignorado por Git):

```dotenv
AGENT_MODE=groq
TOOLS_MODE=mcp
GROQ_API_KEY=REEMPLAZAR_LOCALMENTE
GROQ_MODEL=openai/gpt-oss-20b
```

Conservar las direcciones MCP y Redis y los orígenes permitidos existentes.
La API rechaza el arranque de Groq sin clave. No colocar claves en variables
`VITE_*`, capturas, logs o commits. El adaptador utiliza el endpoint HTTPS fijo
de Groq y rechaza redirecciones.

Reiniciar API y demo en terminales separadas desde la raíz:

```powershell
pnpm dev:api
```

```powershell
pnpm dev:demo
```

Redis y MCP deben seguir activos; Ollama deja de ser necesario para este modo.
Si hay variables de entorno previas en la terminal, tienen prioridad sobre `.env`.
El arranque debe registrar `mode: "groq"`. Una sesión nueva debe conectar y
recibir recomendaciones, pósteres y referencias como con el proveedor local.

En Compose, usar `AGENT_MODE`, `GROQ_API_KEY` y `GROQ_MODEL` en el entorno o en
el `.env` raíz: Compose no carga el `.env` de la API. Ambas réplicas reciben la
misma configuración. Las claves de TMDB y Google Books permanecen en MCP.

## Prueba real y evals

Probar una recomendación natural, una búsqueda concreta, una comparación y la
apertura de referencias. El catálogo verificado continúa limitado a Dune (2021);
el cambio de modelo no amplía esa evidencia ni garantiza calidad o latencia.

```powershell
$env:RUN_LIVE_EVALS = '1'
pnpm eval:agent:live
```

El comando lee `apps/api/.env` y registra proveedor, modelo y versión de prompt
en `evals/results/`. Los 30 casos requieren revisión humana. Las evals son
secuenciales; pueden exceder la cuota gratuita y los errores no cuentan como
éxitos funcionales. Se mantiene un plazo de 60 segundos por caso.

El adaptador reintenta HTTP 429 una sola vez cuando `Retry-After` indica una
espera de hasta 30 segundos, respetando la cancelación. Si la cuota continúa
agotada, devuelve `rate_limited`; consultar la cuota en la consola.

Si Groq devuelve HTTP 400 con código `tool_use_failed`, solicita una sola
corrección al modelo. Esto cubre llamadas como `year: null`: el esquema requiere
un entero o que se omita el parámetro opcional. La corrección conserva el
historial y las herramientas disponibles; no ejecuta la generación rechazada
ni incorpora el cuerpo de error del proveedor al contexto. Las llamadas
corregidas siguen pasando por la validación MCP antes de ejecutarse.

Los fallos de red, otros errores del proveedor y una corrección fallida se
convierten en `unavailable`, sin reenviar cuerpos privados al usuario. Ese
mensaje genérico no permite concluir por sí solo que Groq esté caído.

Las pruebas automatizadas no usan credenciales reales: comprueban el ciclo
agente/herramientas, correlación, respuestas truncadas, errores, cancelación y
redacción de información privada. Su aprobación no acredita evals reales.

## Volver al modelo local

Cambiar `AGENT_MODE=ollama`, conservar `OLLAMA_MODEL` y reiniciar la API.
No hay fallback automático: así las mediciones y evals identifican el proveedor
que realmente respondió.

Referencias: [herramientas](https://console.groq.com/docs/tool-use/local-tool-calling),
[modelos](https://console.groq.com/docs/models),
[cuotas](https://console.groq.com/docs/rate-limits).
