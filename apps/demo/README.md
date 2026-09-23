# AGIChat Widget SDK — Demo

Aplicación de demostración del SDK. Muestra el mismo conjunto de casos de
uso integrado de dos formas distintas:

- **`index.html`** — usando `ChatWidget` de `@agichat/react` directamente.
- **`web-component.html`** — usando el Web Component `<agi-chat-widget>` de
  `@agichat/embed`, sin React en la página.

Los cuatro casos de uso (definidos en [`src/scenarios.ts`](src/scenarios.ts)
y compartidos por ambas páginas) usan `MockTransportAdapter` de
`@agichat/transport-mock`:

| Escenario | Qué muestra |
|---|---|
| Chat básico | Conversación exitosa. Pregunta "¿cuál es la respuesta a la vida, el universo y todo?" para ver la respuesta especial del wireframe ("42"). |
| Manejo de error | El mock rechaza cada envío (`mode: "error"`) para ver el banner de error del widget. |
| Timeout | El mock nunca responde dentro de 4 s (`mode: "timeout"`) para ver el comportamiento cuando el backend no contesta. |
| Tema personalizado | El mismo mock exitoso, con una paleta distinta aplicada mediante la prop/propiedad `theme`. |

## Cómo ejecutarla

Este paquete depende de `@agichat/react` y `@agichat/embed` ya compilados
(sus `package.json` apuntan a `dist/`), así que hay que construir el
workspace antes de levantar la demo:

```bash
pnpm install
pnpm build
pnpm --filter @agichat/demo dev
```

Esto abre un servidor de Vite con ambas páginas disponibles
(`/index.html` y `/web-component.html`).

Para verificar tipos o generar un build estático de la demo:

```bash
pnpm --filter @agichat/demo typecheck
pnpm --filter @agichat/demo build
pnpm --filter @agichat/demo preview
```
