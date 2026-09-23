# AGIChat Widget SDK

SDK de chat embebible que permite agregar una interfaz agéntica a cualquier
producto en minutos: como componente de React o como
[Web Component](#3-uso-como-web-component-agi-chat-widget) sin dependencias
para sitios que no usan React. La UX sigue el wireframe entregado por diseño;
la paleta de colores y el tema visual son totalmente personalizables.

## Tabla de contenido

1. [Arquitectura](#1-arquitectura)
2. [Requisitos e instalación](#2-requisitos-e-instalación)
3. [Uso rápido](#3-uso-rápido)
4. [Transportes](#4-transportes)
5. [Tema visual](#5-tema-visual)
6. [Scripts del monorepo](#6-scripts-del-monorepo)
7. [Pruebas y cobertura](#7-pruebas-y-cobertura)
8. [CI/CD y releases](#8-cicd-y-releases)
9. [Contribuir](#9-contribuir)
10. [Demo](#10-demo)
11. [Pendientes](#11-pendientes)

## 1. Arquitectura

Monorepo pnpm con arquitectura de puertos y adaptadores: el dominio del chat
no depende de React, del navegador ni de un transporte concreto; la UI recibe
el transporte por inyección a través del puerto `ITransportAdapter`.

| Paquete | Responsabilidad |
|---|---|
| [`packages/core`](packages/core) | Entidades (`Message`, `Conversation`, `Session`), el puerto `ITransportAdapter` y `ChatEngine`, el motor de estado de la conversación. |
| [`packages/react`](packages/react) | `ChatWidget`, `MessageBubble`, `InputBar`, el hook `useChat` y el sistema de tema (`theme.ts`). |
| [`packages/embed`](packages/embed) | API imperativa (`mountChatWidget`/`unmountChatWidget`) y el Web Component `<agi-chat-widget>`, publicados como bundles ESM e IIFE. |
| [`packages/transport-mock`](packages/transport-mock) | `MockTransportAdapter`: transporte determinista para desarrollar sin backend real. |
| [`packages/transport-websocket`](packages/transport-websocket) | Contrato reservado para el transporte WebSocket real (fase 2 del proyecto); hoy lanza `WebSocketTransportNotImplementedError`. |

> El diagrama Mermaid.js de arquitectura general del proyecto todavía no
> existe en el repo — ver [Pendientes](#11-pendientes).

Convenciones de código para herramientas de codeo agéntico y humanos: ver
[`AGENTS.md`](AGENTS.md).

## 2. Requisitos e instalación

- Node.js 22 (versión usada en CI).
- pnpm `11.19.0`, gestionado con [Corepack](https://nodejs.org/api/corepack.html).

```bash
corepack enable
pnpm install --frozen-lockfile
```

Los paquetes se compilan a `dist/` antes de poder usarse o tipar en conjunto
(ver [Scripts del monorepo](#6-scripts-del-monorepo)):

```bash
pnpm build
```

## 3. Uso rápido

### Como componente de React

```tsx
import { ChatWidget, MockTransportAdapter } from "@agichat/react";

const transport = new MockTransportAdapter();

export function App() {
  return (
    <ChatWidget
      transport={transport}
      title="AGIChat"
      subtitle="Asistente virtual · En línea"
    />
  );
}
```

`ChatWidget` acepta, entre otras props: `transport` (obligatoria),
`session`/`sessionId`, `title`, `subtitle`, `placeholder`,
`emptyStateMessage` y `theme`. El estado de la conversación se puede
consumir directamente con el hook `useChat({ transport, session? })` si se
necesita construir una UI propia sobre `@agichat/core`.

### Como Web Component (`<agi-chat-widget>`)

Para sitios sin React, `@agichat/embed` registra un Custom Element que monta
`ChatWidget` internamente dentro de un Shadow DOM:

```html
<script type="module">
  import "@agichat/embed";
</script>

<agi-chat-widget
  title="AGIChat"
  placeholder="Escribe tu pregunta…"
></agi-chat-widget>
```

Atributos observados: `title`, `session-id`, `placeholder` y
`empty-state-message`. El transporte y el tema se asignan como propiedades
de JavaScript (no como atributos HTML), porque reciben objetos:

```js
import "@agichat/embed";
import { MockTransportAdapter } from "@agichat/react";

const widget = document.querySelector("agi-chat-widget");
widget.transport = new MockTransportAdapter();
widget.theme = { accent: "#7c3aed" };
```

Si no se asigna `transport`, el componente crea automáticamente un
`MockTransportAdapter` propio (útil para demos) y lo libera al desconectarse.

### API imperativa

`@agichat/embed` también expone un montaje imperativo para integrarlo sin
Custom Elements, por ejemplo dentro de otro framework:

```ts
import { mountChatWidget } from "@agichat/embed";
import { MockTransportAdapter } from "@agichat/react";

const unmount = mountChatWidget("#chat-container", {
  transport: new MockTransportAdapter()
});

// más tarde, al desmontar la vista:
unmount();
```

## 4. Transportes

- **`MockTransportAdapter`** (`@agichat/transport-mock`, re-exportado también
  desde `@agichat/react`): simula respuestas con retardo configurable
  (`sendDelayMs`, `typingDelayMs`, `replyDelayMs`), y tres modos —
  `"success"`, `"error"`, `"timeout"` — para probar la UI en cada escenario.
  Responde `"42"` si el mensaje pregunta por "la vida, el universo y todo lo
  demás", replicando el caso del wireframe; cualquier otro mensaje recibe una
  respuesta simulada en Markdown.
- **`WebSocketTransportAdapter`** (`@agichat/transport-websocket`): mantiene
  el mismo contrato `ITransportAdapter` como reserva de API para la
  implementación real de la fase 2 del proyecto. Hoy valida la URL (`ws:`/
  `wss:`) pero `sendMessage` rechaza con `WebSocketTransportNotImplementedError`.

Cualquier otro backend puede integrarse implementando `ITransportAdapter`
desde `@agichat/core` (`sendMessage`, `subscribe`, `dispose`).

## 5. Tema visual

`@agichat/react` expone `defaultTheme` y `resolveTheme` desde `theme.ts`.
`ChatWidget`, `MessageBubble` e `InputBar` aceptan una prop `theme` parcial
(`AGIChatThemeOverride`) que se combina sobre el tema por defecto:

```tsx
<ChatWidget
  transport={transport}
  theme={{
    accent: "#7c3aed",
    headerBackground: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)"
  }}
/>
```

El tema controla tipografía, espaciados, radios, colores de burbujas,
encabezado, input y estados de error — ver la interfaz completa
`AGIChatTheme` en [`packages/react/src/theme.ts`](packages/react/src/theme.ts).

## 6. Scripts del monorepo

Desde la raíz, en orden recomendado (el build debe correr antes del
typecheck global porque los paquetes publican sus declaraciones desde
`dist`):

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test:coverage
```

Para validar un solo paquete:

```bash
pnpm --filter @agichat/react test
pnpm --filter @agichat/embed typecheck
```

Otros scripts disponibles: `pnpm test` (sin cobertura),
`pnpm release:prepare` (genera artefactos de release localmente en
`release-artifacts/`, ver [CI/CD y releases](#8-cicd-y-releases)).

## 7. Pruebas y cobertura

Cada paquete usa Vitest de forma independiente y debe mantener **cobertura
mínima de 80%** en líneas, ramas, funciones y statements. Las pruebas no
dependen de red ni de servicios externos. El detalle de convenciones de
testing (incluyendo Web Components y accesibilidad) está en
[`AGENTS.md`](AGENTS.md#pruebas-y-cobertura).

## 8. CI/CD y releases

- `.github/workflows/ci.yml`: en cada PR y push a `main`, corre lint, build,
  typecheck y `test:coverage` en Node 22 (job `Quality gate`).
- `.github/workflows/release.yml` + Release Please: versiona el SDK,
  actualiza `CHANGELOG.md` y publica el GitHub Release con los bundles ESM e
  IIFE, un `.tgz` instalable por paquete y `SHA256SUMS.txt`.
- La rama `main` está protegida: PR obligatorio con al menos una aprobación,
  sin push directo.

Detalle completo del flujo de publicación (Conventional Commits, permisos de
GitHub, artefactos generados) en [`docs/RELEASING.md`](docs/RELEASING.md).

## 9. Contribuir

Este proyecto sigue GitHub Flow:

1. Crea una rama desde `main` actualizado: `feature/<paquete>-<tarea>`,
   `fix/<paquete>-<problema>` o `docs/<tema>`.
2. Haz el cambio mínimo necesario, con pruebas en el mismo bloque funcional.
3. Abre un PR hacia `main`; requiere `Quality gate` en verde y al menos una
   aprobación antes de mergear.
4. No hagas push directo a `main`.

Convenciones de código completas y forma de trabajo recomendada para
herramientas de codeo agéntico: [`AGENTS.md`](AGENTS.md).

## 10. Demo

[`apps/demo`](apps/demo) es una aplicación de demostración con cuatro casos
de uso sobre `MockTransportAdapter` (chat básico, error, timeout y tema
personalizado), integrados de dos formas: con `ChatWidget` de
`@agichat/react` (`index.html`) y con el Web Component `<agi-chat-widget>`
de `@agichat/embed`, sin React (`web-component.html`).

```bash
pnpm install
pnpm build
pnpm --filter @agichat/demo dev
```

Detalle de cada escenario y otros comandos (`typecheck`, `build`, `preview`)
en [`apps/demo/README.md`](apps/demo/README.md).


