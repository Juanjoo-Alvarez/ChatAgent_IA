import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { ITransportAdapter, Session } from "@agichat/core";

import { useChat } from "../../hooks/useChat";
import { resolveTheme, type AGIChatThemeOverride } from "../../theme";
import { AgentIcon, SendIcon } from "../icons";
import { InputBar } from "../InputBar/InputBar";
import { MessageBubble } from "../MessageBubble/MessageBubble";
import { TmdbCredits } from "../TmdbCredits";
import { widgetCss, widgetStyle } from "./styles";

export interface ChatSuggestion {
  readonly label: string;
  readonly prompt: string;
  readonly description?: string;
}

export interface ChatWidgetProps {
  readonly transport: ITransportAdapter;
  readonly session?: Session;
  readonly sessionId?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly placeholder?: string;
  readonly welcomeTitle?: string;
  readonly emptyStateMessage?: string;
  readonly suggestions?: readonly ChatSuggestion[];
  readonly layout?: "widget" | "full";
  readonly theme?: AGIChatThemeOverride;
  readonly showTmdbCredits?: boolean;
}

/** Vista del SDK: el dominio y el transporte siguen siendo responsabilidad de Core. */
export const ChatWidget = ({
  transport,
  session,
  sessionId,
  title = "AGIChat",
  subtitle,
  placeholder,
  welcomeTitle = "¿En qué puedo ayudarte?",
  emptyStateMessage = "Escribe un mensaje para comenzar la conversación.",
  suggestions = [],
  layout = "widget",
  theme: themeOverride,
  showTmdbCredits = false
}: ChatWidgetProps): ReactElement => {
  const theme = resolveTheme(themeOverride);
  const { messages, isAgentTyping, isSending, error, sendMessage, connectionStatus, capabilityNotice, mode } = useChat({
    transport,
    ...(session !== undefined ? { session } : {}),
    ...(sessionId !== undefined ? { sessionId } : {})
  });
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const lastMessage = messages.at(-1);

  // Acompañar mensajes nuevos sin interrumpir a quien está leyendo el historial.
  useEffect(() => {
    const list = messagesRef.current;
    if (list !== null && followLatest.current) {
      list.scrollTop = lastMessage === undefined ? 0 : list.scrollHeight;
    }
  }, [lastMessage, isAgentTyping]);

  // El borrador tampoco debe pasar de una sesión a otra.
  useEffect(() => { setDraft(""); followLatest.current = true; }, [session, sessionId, transport]);

  const connectionCopy = {
    idle: "Listo para conversar",
    connecting: "Conectando…",
    connected: mode === "fixture" ? "Modo de prueba · En línea" : "Asistente virtual · En línea",
    disconnected: "Sin conexión"
  }[connectionStatus];

  return (
    <section className={`agichat-widget${layout === "full" ? " agichat-widget--full" : ""}`}
      style={widgetStyle(theme, layout === "full")} aria-label={title} data-testid="chat-widget">
      <style>{widgetCss}</style>
      <header className="agichat-widget__header" style={{ background: theme.headerBackground, color: theme.headerText }}>
        <span className="agichat-widget__avatar" style={{ backgroundColor: theme.agentAvatarBackground, color: theme.agentAvatarText }} data-testid="header-avatar">
          <AgentIcon />
        </span>
        <div className="agichat-widget__heading">
          <span className="agichat-widget__title">{title}</span>
          <span className="agichat-widget__subtitle" style={{ color: theme.headerMutedText }} role="status">
            <span aria-hidden="true" className="agichat-widget__online-indicator" style={{ backgroundColor: connectionStatus === "connected" ? theme.onlineIndicator : theme.mutedText }} />
            {subtitle ?? connectionCopy}
          </span>
        </div>
      </header>
      {capabilityNotice !== null && <p role="status" className="agichat-widget__notice">{capabilityNotice}</p>}

      <div className={`agichat-widget__messages${messages.length === 0 ? " agichat-widget__messages--empty" : ""}`}
        ref={messagesRef} onScroll={(event) => {
          const list = event.currentTarget;
          followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        }} role="log" aria-label="Conversación" aria-live="polite" aria-relevant="additions text" tabIndex={0}>
        {messages.length === 0 ? (
          <div className="agichat-welcome">
            <span className="agichat-welcome__avatar" style={{ backgroundColor: theme.agentAvatarBackground, color: theme.agentAvatarText }} aria-hidden="true"><AgentIcon /></span>
            <h2 className="agichat-welcome__title">{welcomeTitle}</h2>
            <p className="agichat-welcome__description">{emptyStateMessage}</p>
            {suggestions.length > 0 && <div className="agichat-welcome__suggestions" role="group" aria-label="Ideas para empezar">
              {suggestions.map((suggestion) => (
                <button className="agichat-welcome__suggestion" type="button" key={suggestion.label} disabled={isSending}
                  onClick={() => { setDraft(suggestion.prompt); inputRef.current?.focus(); }}>
                  <span><strong>{suggestion.label}</strong>{suggestion.description !== undefined && <small>{suggestion.description}</small>}</span>
                  <SendIcon />
                </button>
              ))}
            </div>}
          </div>
        ) : (
          <div className="agichat-widget__thread">
            {messages.map((message) => <MessageBubble key={message.id} message={message} theme={theme} />)}
          </div>
        )}
        {(showTmdbCredits || messages.some((message) => message.role === "agent" && message.cards.length > 0)) &&
          <div className="agichat-widget__credits"><TmdbCredits /></div>}
      </div>

      {isAgentTyping && <div className="agichat-widget__typing" role="status" aria-label="El agente está escribiendo">
        <span className="agichat-widget__typing-dots" aria-hidden="true">
          {[0, 1, 2].map((dot) => <span key={dot} className="agichat-widget__typing-dot" />)}
        </span>
        <span>El agente está escribiendo…</span>
      </div>}

      {error !== null && <p className="agichat-widget__error" role="alert" style={{ color: theme.errorText, backgroundColor: theme.errorBackground }}>
        No se pudo enviar tu mensaje. Intenta nuevamente.
        <span style={{ display: "block" }}>{error.message}</span>
      </p>}

      <div className="agichat-widget__composer">
        <InputBar onSend={(text) => { followLatest.current = true; void sendMessage(text); }} disabled={isSending}
          theme={theme} value={draft} onValueChange={setDraft} inputRef={inputRef}
          {...(placeholder !== undefined ? { placeholder } : {})} />
        <p className="agichat-widget__input-hint">Enter para enviar · Shift + Enter para un salto de línea</p>
      </div>
    </section>
  );
};
