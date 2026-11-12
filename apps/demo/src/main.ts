import { AGICHAT_WIDGET_TAG, WebSocketTransportAdapter, type AGIChatWidgetElement } from "@agichat/embed";
import { moviePrompts } from "./moviePrompts";
import "./styles.css";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) { throw new Error(`Demo element was not found: ${selector}`); }
  return element;
}

const widget = required<AGIChatWidgetElement>(AGICHAT_WIDGET_TAG);
const status = required<HTMLElement>("[data-copy-status]");
const prompts = required<HTMLElement>("[data-prompt-list]");
const failure = required<HTMLElement>("[data-configuration-error]");

async function copyPrompt(prompt: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(prompt);
    status.textContent = "Mensaje copiado. Pégalo en el chat para enviarlo.";
  } catch { status.textContent = `Escribe en el chat: ${prompt}`; }
}

for (const prompt of moviePrompts) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "prompt-button";
  button.textContent = prompt;
  button.addEventListener("click", () => { void copyPrompt(prompt); });
  prompts.append(button);
}

try {
  const url = import.meta.env.VITE_CHAT_WEBSOCKET_URL
    || (import.meta.env.DEV ? "ws://127.0.0.1:8000/chat" : undefined);
  if (url === undefined) { throw new Error("Chat endpoint is not configured"); }
  const transport = new WebSocketTransportAdapter({ url });
  widget.transport = transport;
  // Una página conservada en bfcache puede volver a mostrarse con su sesión.
  window.addEventListener("pagehide", (event) => { if (!event.persisted) { transport.dispose(); } });
} catch {
  widget.remove();
  failure.hidden = false;
}
