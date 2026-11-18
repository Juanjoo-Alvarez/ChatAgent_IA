import { mountChatWidget, WebSocketTransportAdapter, type UnmountChatWidget } from "@agichat/embed";
import { moviePrompts } from "./moviePrompts";
import "./styles.css";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) { throw new Error(`Demo element was not found: ${selector}`); }
  return element;
}

const root = required<HTMLElement>("[data-chat-root]");
const failure = required<HTMLElement>("[data-configuration-error]");
const restart = required<HTMLButtonElement>("[data-new-conversation]");
const dialog = required<HTMLDialogElement>("[data-help-dialog]");
let transport: WebSocketTransportAdapter | undefined;
let unmount: UnmountChatWidget | undefined;

function startConversation(): void {
  unmount?.();
  transport?.dispose();
  unmount = undefined;
  transport = undefined;
  try {
    const url = import.meta.env.VITE_CHAT_WEBSOCKET_URL
      || (import.meta.env.DEV ? "ws://127.0.0.1:8000/chat" : undefined);
    if (url === undefined) { throw new Error("Chat endpoint is not configured"); }
    // Esperar el error de la API: el modelo local puede necesitar hasta 180 s.
    const responseTimeoutMs = Number(import.meta.env.VITE_CHAT_RESPONSE_TIMEOUT_MS || 185000);
    transport = new WebSocketTransportAdapter({ url, responseTimeoutMs });
    unmount = mountChatWidget(root, {
      transport,
      layout: "full",
      showTmdbCredits: true,
      title: "Hablemos de cine",
      welcomeTitle: "¿Qué vemos hoy?",
      emptyStateMessage: "Soy Sofía, tu compañera de cine. Puedo recomendarte películas y compararlas con sus libros para decidir si vale la pena verlas.",
      placeholder: "¿Qué película tienes en mente?",
      suggestions: moviePrompts,
      theme: { fontFamily: '"Instrument Sans", system-ui, sans-serif', fontSize: 16 }
    });
    root.hidden = false;
    failure.hidden = true;
  } catch {
    transport?.dispose();
    root.hidden = true;
    failure.hidden = false;
  }
}

restart.addEventListener("click", () => {
  startConversation();
  // React monta la nueva raíz de forma asíncrona; el marco ya está disponible.
  required<HTMLElement>("#conversation").focus();
});
required<HTMLButtonElement>("[data-reload]").addEventListener("click", startConversation);
required<HTMLButtonElement>("[data-open-help]").addEventListener("click", () => dialog.showModal());
dialog.addEventListener("click", (event) => { if (event.target === dialog) { dialog.close(); } });

// Una página conservada en bfcache puede volver a mostrarse con su sesión.
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) { unmount?.(); transport?.dispose(); }
});
startConversation();
