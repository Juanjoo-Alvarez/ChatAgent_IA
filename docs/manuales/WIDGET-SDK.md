# Manual del widget y del SDK

Este manual explica cómo integrar el widget de AGIChat en un sitio: como
componente de React, como Web Component o con la API imperativa. También cubre
el tema visual, la elección de transporte, los créditos de TMDB y la apertura de
pestañas.

La API pública se verificó en `packages/*/src/index.ts` y `apps/demo/src/main.ts`
en el commit `ccd40d9`.

## Paquetes

| Paquete | Para qué se usa |
| --- | --- |
| `@agichat/embed` | Web Component `<agi-chat-widget>`, `mountChatWidget`, `updateChatWidget`, `unmountChatWidget`. Reexporta `WebSocketTransportAdapter` |
| `@agichat/react` | `ChatWidget`, `useChat`, `MessageBubble`, `InputBar`, `defaultTheme`, `resolveTheme` y el mock |
| `@agichat/transport-websocket` | `WebSocketTransportAdapter` para el agente real |
| `@agichat/transport-mock` | `MockTransportAdapter`, el transporte simulado de la Fase 1 |
| `@agichat/core` | `ChatEngine` y el puerto `ITransportAdapter` |

`@agichat/embed` genera dos bundles con React incluido:

| Bundle | Uso |
| --- | --- |
| `dist/agichat-widget.js` (ESM) | `import` desde una aplicación o `<script type="module">` |
| `dist/agichat-widget.iife.js` (IIFE) | `<script>` clásico; expone el global `AGIChat` y registra la etiqueta |

## Elegir el transporte

| Transporte | Cuándo usarlo |
| --- | --- |
| `WebSocketTransportAdapter` | Con el agente real de la Fase 2. Pide sesión con `POST /sessions`, autentica el WebSocket, reconecta de forma acotada y cancela |
| `MockTransportAdapter` | Desarrollo de UI y pruebas sin backend, como en la Fase 1 |

Opciones principales de `WebSocketTransportAdapter`:

| Opción | Predeterminado | Descripción |
| --- | --- | --- |
| `url` | Obligatoria | Endpoint WebSocket terminado en `/chat` (`ws://` en local, `wss://` en producción) |
| `responseTimeoutMs` | 65000 | Espera máxima de una respuesta; debe superar `TURN_TIMEOUT_MS`. La demo usa 185000 |
| `connectTimeoutMs` | 10000 | Espera máxima de la conexión |
| `maxReconnectAttempts` | 3 | Reintentos automáticos; 0 los desactiva |
| `reconnectDelayMs`, `maxReconnectDelayMs` | 500 y 5000 | Espera entre reintentos |

Las credenciales de la sesión viven solo en memoria del transporte. Nunca van
en la URL, en atributos ni en logs.

## API imperativa

Es la forma que usa la demo (`apps/demo/src/main.ts`):

```ts
import { mountChatWidget, WebSocketTransportAdapter } from "@agichat/embed";

const transport = new WebSocketTransportAdapter({
  url: "ws://127.0.0.1:8000/chat",
  responseTimeoutMs: 185000
});

const unmount = mountChatWidget("#chat", {
  transport,
  title: "Hablemos de cine",
  welcomeTitle: "¿Qué vemos hoy?",
  emptyStateMessage: "Puedo recomendarte películas y compararlas con sus libros.",
  placeholder: "¿Qué película tienes en mente?",
  layout: "full",
  showTmdbCredits: true
});

// Al retirar el widget:
unmount();
transport.dispose();
```

`mountChatWidget` acepta un elemento, un `DocumentFragment` o un selector CSS.
`updateChatWidget(destino, props)` cambia las propiedades conservando la raíz
de React y la conversación; devuelve `false` si el destino no está montado.

Con el mock de la Fase 1 basta cambiar el transporte:

```ts
import { mountChatWidget } from "@agichat/embed";
import { MockTransportAdapter } from "@agichat/transport-mock";

const transport = new MockTransportAdapter();
const unmount = mountChatWidget("#chat", { transport, title: "Asistente de producto" });
```

## Web Component

Después de cargar el bundle ESM o IIFE:

```html
<script src="agichat-widget.iife.js"></script>

<agi-chat-widget
  title="Películas y libros"
  websocket-url="ws://127.0.0.1:8000/chat"
  welcome-title="¿Qué vemos hoy?"
  placeholder="¿Qué película tienes en mente?"
  tmdb-credits
></agi-chat-widget>
```

| Atributo | Descripción |
| --- | --- |
| `title` | Título del encabezado |
| `websocket-url` | Crea un `WebSocketTransportAdapter` propio del elemento, con las opciones predeterminadas (espera de 65 s) |
| `placeholder` | Texto del campo de entrada |
| `welcome-title`, `empty-state-message` | Pantalla inicial |
| `layout` | `widget` (por defecto) o `full` |
| `session-id` | Identificador local de UI; **no** es el token ni la sesión del servidor |
| `tmdb-credits` | Atributo booleano que muestra siempre los créditos de TMDB |

| Propiedad | Descripción |
| --- | --- |
| `transport` | Transporte inyectado. Tiene prioridad sobre `websocket-url` y pertenece al consumidor |
| `theme` | Tema parcial (ver más abajo) |
| `suggestions` | Lista de `{ label, prompt, description? }` para la pantalla inicial |

Comportamiento del ciclo de vida:

- Cada instancia crea su propio transporte y pide sus propias credenciales.
- Cambiar título, placeholder, mensajes, créditos o tema conserva la
  conversación. Cambiar `websocket-url` o `session-id` renueva el transporte que
  posee el elemento.
- Al desconectar el elemento se liberan sus recursos. Al reconectarlo empieza
  una conversación nueva.
- Un transporte inyectado en `element.transport` no se destruye con el elemento:
  el consumidor debe llamar a `dispose()`. No compartas un transporte entre
  widgets de usuarios distintos.
- Sin endpoint ni transporte inyectado, el elemento usa el mock por
  compatibilidad con la Fase 1. La demo siempre inyecta WebSocket y nunca cambia
  en silencio a un mock si el servicio falla.
- El widget vive en un Shadow DOM abierto, así que los estilos del sitio no lo
  afectan.
- Con `websocket-url`, el navegador espera como máximo 65 s por respuesta y no
  hay atributo para cambiarlo. Si la API usa `TURN_TIMEOUT_MS=180000`, inyecta un
  transporte propio en `element.transport` con `responseTimeoutMs: 185000`.

## React

```tsx
import { ChatWidget } from "@agichat/react";
import { WebSocketTransportAdapter } from "@agichat/transport-websocket";
import { useEffect, useState } from "react";

export function Chat() {
  const [transport] = useState(() => new WebSocketTransportAdapter({ url: "ws://127.0.0.1:8000/chat" }));
  useEffect(() => () => transport.dispose(), [transport]);
  return <ChatWidget transport={transport} title="Películas y libros" showTmdbCredits />;
}
```

Para construir una interfaz propia, el hook `useChat` expone mensajes, estado de
conexión, indicador de escritura, aviso de capacidades, modo y `sendMessage`.

## Tema personalizado

Las propiedades no especificadas conservan los valores de `defaultTheme`. El
tema completo está en `packages/react/src/theme.ts`.

```ts
const widget = document.querySelector("agi-chat-widget");

if (widget !== null) {
  widget.theme = {
    fontFamily: '"Instrument Sans", system-ui, sans-serif',
    accent: "#0f766e",
    headerBackground: "linear-gradient(135deg, #134e4a, #0f766e)",
    userBubbleBackground: "#0f766e",
    widgetRadius: 20
  };
}
```

Con la API imperativa o React, pasa el mismo objeto en la prop `theme`.

## Mensajes, tarjetas y Markdown

- El texto del agente se renderiza como Markdown con `react-markdown`, **sin
  interpretar HTML** y sin `dangerouslySetInnerHTML`.
- Las recomendaciones aparecen como tarjetas con título, año y póster. El póster
  solo se acepta desde `https://image.tmdb.org/t/p/`. Si falta o no carga, la
  tarjeta muestra «Póster no disponible».
- El encabezado indica el modo: «Asistente virtual · En línea» con el agente
  real o «Modo de prueba · En línea» con `AGENT_MODE=fixture`.

## Créditos de TMDB

`TmdbCredits` muestra el logo oficial sin modificar y el aviso
*«This product uses the TMDB API but is not endorsed or certified by TMDB.»*
El logo se distribuye como URL de datos para funcionar en el bundle IIFE y dentro
del Shadow DOM.

Los créditos aparecen cuando hay tarjetas de recomendación o cuando se activa
`showTmdbCredits` (atributo `tmdb-credits`). La demo los activa desde el inicio.
Un integrador que muestre datos de TMDB solo en texto debe activarlo.

## Apertura de IMDb y Google Books sin clic

El usuario escribe una orden como «Abre IMDb» y la página se abre en una pestaña
nueva sin pulsar ningún enlace.

1. Al enviar el mensaje, `ReferenceNavigator` comprueba con la gramática
   compartida si es una orden de apertura de una referencia ya mostrada.
2. Si lo es, reserva una pestaña `about:blank` **durante el gesto del usuario**
   y la desvincula de `window.opener`.
3. Cuando llega la acción `open-reference` validada por el servidor, comprueba
   que coincida con la referencia pedida y navega la pestaña reservada a la URL
   construida por `referenceUrl`.
4. Si hay un error, el turno termina sin acción o el widget se desmonta, la
   reserva se cierra. Las acciones repetidas se descartan.

Órdenes aceptadas: `Abre IMDb`, `Abre Google Books`, `Open IMDb`,
`¿Puedes abrir IMDb?`, `¿Podrías abrir Google Books?`, `Can you open IMDb?`,
con `Por favor` opcional. También se aceptan:

- El nombre y el año de la obra, como `Abre IMDb de Duna (2021)`, o un
  identificador después del proveedor cuando dos obras tienen el mismo nombre.
- Un prefijo de lista, como `1. Abre Google Books de The Hunger Games`.
- Tras una comparación verificada, el título de la película como nombre del libro:
  `Abre Google Books del libro de Los juegos del hambre`. Si hay una única
  referencia de Google Books, también `Abre Google Books del libro que mencionaste`.
- Referencias al resultado anterior: `Abre IMDb de eso`, `Abre su página en IMDb`
  y `Abre Google Books de ese libro`.

Las peticiones sin título ni identificador usan las referencias del resultado más
reciente, no todas las obras acumuladas en la conversación. Abrir una referencia no
cambia esa selección: después de abrir IMDb se puede pedir el Google Books del
mismo libro. `Abre eso` requiere una sola referencia entre ambos proveedores en ese
resultado. Si hay varias, el agente muestra nombres y años para elegir; la
selección por nombre solo procede cuando identifica una referencia única. Los
nombres e identificadores explícitos también permiten volver a una obra anterior.

Una negación, una orden entre comillas o incrustada en otra frase no autoriza la
apertura. Pedir ambas páginas a la vez requiere aclaración.

### Requisitos del navegador

- Las ventanas emergentes deben estar permitidas para el origen del sitio. Si
  el navegador bloquea la reserva, el widget muestra «Permite las ventanas
  emergentes para este sitio y vuelve a pedir abrir la referencia».
- La orden debe enviarse con un gesto real del usuario (Enter o el botón de
  enviar).
- La referencia debe haber aparecido antes en la conversación de ese widget.

La secuencia completa está en [AGENTE.md](../arquitectura/AGENTE.md#diagrama-3-abrir-una-referencia-sin-clic).

## Desarrollo local

```powershell
$env:AGENT_MODE = 'fixture'
$env:TOOLS_MODE = 'fixture'
pnpm dev:api
```

En otra terminal, `pnpm dev:demo`. En desarrollo, la demo usa
`ws://127.0.0.1:8000/chat` si no se configura otra dirección. Para cambiarla,
copia `apps/demo/.env.example` a `apps/demo/.env` sin sobrescribir uno existente
y ajusta `VITE_CHAT_WEBSOCKET_URL`.

El modo fixture recorre HTTP, WebSocket y el widget, pero no usa un LLM ni
ofrece referencias o pósteres reales. Para el producto completo, sigue
[ARRANQUE.md](./ARRANQUE.md). Para publicarlo, [DESPLIEGUE.md](./DESPLIEGUE.md).
