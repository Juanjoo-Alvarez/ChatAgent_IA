export const AGICHAT_WIDGET_TAG = "agi-chat-widget" as const;

export {
  mountChatWidget,
  unmountChatWidget,
  type ChatWidgetTarget,
  type UnmountChatWidget
} from "./mountChatWidget";
export type { ChatWidgetProps } from "@agichat/react";
