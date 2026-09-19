import { registerAGIChatWidget } from "./AGIChatWidgetElement";

export {
  AGIChatWidgetElement,
  registerAGIChatWidget,
  type AGIChatTransport
} from "./AGIChatWidgetElement";
export { AGICHAT_WIDGET_TAG } from "./constants";

export {
  mountChatWidget,
  unmountChatWidget,
  type ChatWidgetTarget,
  type UnmountChatWidget
} from "./mountChatWidget";
export type { ChatWidgetProps } from "@agichat/react";

if (typeof globalThis.customElements !== "undefined") {
  registerAGIChatWidget(globalThis.customElements);
}
