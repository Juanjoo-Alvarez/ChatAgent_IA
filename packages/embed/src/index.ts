import { registerAGIChatWidget } from "./AGIChatWidgetElement";

// API pública para integración declarativa e imperativa.
export {
  AGIChatWidgetElement,
  registerAGIChatWidget,
  type AGIChatTransport,
  type AGIChatWidgetTheme
} from "./AGIChatWidgetElement";
export { AGICHAT_WIDGET_TAG } from "./constants";

export {
  mountChatWidget,
  unmountChatWidget,
  type ChatWidgetTarget,
  type UnmountChatWidget
} from "./mountChatWidget";
export type { ChatWidgetProps } from "@agichat/react";

// El bundle se puede importar durante SSR; el registro automático solo ocurre
// cuando existe el registro de Custom Elements del navegador.
if (typeof globalThis.customElements !== "undefined") {
  registerAGIChatWidget(globalThis.customElements);
}
