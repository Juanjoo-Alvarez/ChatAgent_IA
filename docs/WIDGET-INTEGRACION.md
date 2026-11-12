# Widget de películas: integración

## Desarrollo local

En una terminal, levantar el backend sin credenciales:

```powershell
$env:AGENT_MODE = 'fixture'
$env:TOOLS_MODE = 'fixture'
pnpm dev:api
```

En otra terminal, ejecutar `pnpm dev:demo`. Ese comando compila las dependencias
del SDK antes de iniciar Vite. En desarrollo la demo utiliza
`ws://127.0.0.1:8000/chat` si no se especifica otra dirección.

Para cambiar el backend, copiar `apps/demo/.env.example` a `apps/demo/.env`, sin
sobrescribir un archivo existente, y configurar `VITE_CHAT_WEBSOCKET_URL`.
Solo contiene una dirección pública; nunca incluir credenciales en variables
`VITE_*`, ya que Vite las incorpora al JavaScript del navegador.

El modo fixture recorre HTTP, WebSocket y el widget, pero no usa un LLM ni ofrece
referencias o pósteres reales. Para películas y comparación reales, seguir
[BACKEND-AGENTE.md](./BACKEND-AGENTE.md) y la configuración de libros del MCP.
El propio widget anuncia el modo fixture recibido del servidor.

## Web Component

Después de cargar el bundle ESM o IIFE:

```html
<agi-chat-widget
  title="Películas y libros"
  websocket-url="ws://127.0.0.1:8000/chat"
  tmdb-credits
></agi-chat-widget>
```

Cada instancia crea su propio transporte y solicita sus propias credenciales
al backend. Estas permanecen en memoria; `session-id` es un identificador local
de UI y no un token ni la sesión autenticada del servidor.

Cambiar título, placeholder, mensaje inicial, créditos o tema conserva la raíz
de React y la conversación. Cambiar `websocket-url` o `session-id` renueva el
transporte que el elemento posee. Desconectarlo libera sus recursos; reconectarlo
crea una conversación nueva. La reconexión de red dentro del mismo transporte
conserva las credenciales y utiliza la política de recuperación del protocolo.

Sin endpoint ni transporte inyectado se conserva el mock para compatibilidad
con el proyecto 1. La demo del proyecto 2 siempre inyecta WebSocket y nunca
cambia silenciosamente a un mock si falla el servicio.

Si se asigna `element.transport`, ese transporte tiene prioridad sobre el
atributo y pertenece al consumidor. El elemento retira sus suscripciones al
desmontarse, pero no llama a `dispose()` del objeto inyectado. Para una conversación
autenticada nueva, el consumidor debe inyectar un transporte nuevo; cambiar solo
la etiqueta `session-id` no cambia las credenciales de un transporte inyectado.
No compartir el mismo transporte entre widgets de usuarios distintos.

La API imperativa también admite `updateChatWidget(target, props)`: devuelve
`false` si el destino no está montado y conserva la raíz cuando sí lo está.
`showTmdbCredits: true` habilita créditos permanentes; el Web Component usa el
atributo booleano `tmdb-credits`. La demo los mantiene visibles desde el inicio.

## Despliegue

La demo es estática; el backend WebSocket se despliega por separado. Establecer
`VITE_CHAT_WEBSOCKET_URL=wss://<dominio-publico>/chat` antes del build en producción.
Si falta la variable, la demo muestra el chat como no disponible. Configurar
`CHAT_ALLOWED_ORIGINS` en la API con el origen HTTPS exacto de la demo. También
se necesita CORS para `POST /sessions` y un proxy que acepte el upgrade WebSocket.
Las cuotas y las claves de proveedores permanecen en sus servicios del backend.

Consultar [VERCEL.md](./VERCEL.md) y las comprobaciones de pestañas en
[WIDGET-REFERENCIAS.md](./WIDGET-REFERENCIAS.md). La revisión visual y la apertura
real de pestañas siguen pendientes de un navegador disponible; los tests de
componentes utilizan DOM simulado y transportes controlados.
