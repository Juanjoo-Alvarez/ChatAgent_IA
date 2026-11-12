import { widgetStyle, headerStyle, headerAvatarStyle, onlineIndicatorStyle, headerCopyStyle, titleStyle, subtitleStyle, messageListStyle, typingIndicatorStyle, typingDotsStyle, typingDotStyle, errorBannerStyle, emptyStateStyle } from "./styles";
import type { ReactElement } from "react";

import type { ITransportAdapter, Session } from "@agichat/core";

import { useChat } from "../../hooks/useChat";
import {
  resolveTheme,
  type AGIChatThemeOverride
} from "../../theme";
import { AgentIcon } from "../icons";
import { InputBar } from "../InputBar/InputBar";
import { MessageBubble } from "../MessageBubble/MessageBubble";
import { TmdbCredits } from "../TmdbCredits";

export interface ChatWidgetProps {
  // El transporte es obligatorio y mantiene la UI independiente del backend.
  readonly transport: ITransportAdapter;
  readonly session?: Session;
  readonly sessionId?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly placeholder?: string;
  readonly emptyStateMessage?: string;
  readonly theme?: AGIChatThemeOverride;
}

/**
 * Vista principal del SDK. Recibe el transporte por inyección y delega todo el
 * estado conversacional al hook para mantener el componente presentacional.
 */
export const ChatWidget = ({
  transport,
  session,
  sessionId,
  title = "AGIChat",
  subtitle,
  placeholder,
  emptyStateMessage = "Escribe un mensaje para comenzar la conversación.",
  theme: themeOverride
}: ChatWidgetProps): ReactElement => {
  // Cada override se combina con el tema base antes de calcular estilos.
  const theme = resolveTheme(themeOverride);
  const { messages, isAgentTyping, isSending, error, sendMessage, connectionStatus, capabilityNotice, mode } = useChat({
    transport,
    ...(session !== undefined ? { session } : {}),
    ...(sessionId !== undefined ? { sessionId } : {})
  });

  return (
    <section
      className="agichat-widget"
      style={widgetStyle(theme)}
      aria-label={title}
      data-testid="chat-widget"
    >
      <header className="agichat-widget__header" style={headerStyle(theme)}>
        <span
          className="agichat-widget__avatar"
          style={headerAvatarStyle(theme)}
          data-testid="header-avatar"
        >
          <AgentIcon />
          <span
            aria-hidden="true"
            className="agichat-widget__online-indicator"
            style={{ ...onlineIndicatorStyle(theme), display: connectionStatus === "idle" || connectionStatus === "connected" ? "block" : "none" }}
          />
        </span>
        <span style={headerCopyStyle}>
          <span style={titleStyle(theme)}>{title}</span>
          <span style={subtitleStyle(theme)}>{subtitle ?? ({ idle: "Asistente virtual · En línea", connecting: "Conectando…", connected: mode === "fixture" ? "Modo de prueba · En línea" : "Asistente virtual · En línea", disconnected: "Sin conexión" })[connectionStatus]}</span>
        </span>
      </header>
      {capabilityNotice !== null && <p role="status" style={{ margin: 0, padding: "10px 16px", fontSize: theme.smallFontSize }}>{capabilityNotice}</p>}

      <div
        className="agichat-widget__messages"
        style={messageListStyle(theme)}
        role="log"
        aria-live="polite"
      >
        {/* La región live anuncia mensajes nuevos a tecnologías de asistencia. */}
        {messages.length === 0 ? (
          <p
            className="agichat-widget__empty-state"
            style={emptyStateStyle(theme)}
          >
            {emptyStateMessage}
          </p>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} theme={theme} />
          ))
        )}
      </div>

      {isAgentTyping && (
        // El indicador se renderiza solo mientras Core reporta escritura.
        <div
          className="agichat-widget__typing"
          style={typingIndicatorStyle(theme)}
          role="status"
          aria-label="El agente está escribiendo"
        >
          <span style={typingDotsStyle} aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span key={dot} style={typingDotStyle(theme)} />
            ))}
          </span>
          <span>El agente está escribiendo…</span>
        </div>
      )}

      {error !== null && (
        <p
          className="agichat-widget__error"
          role="alert"
          style={errorBannerStyle(theme)}
        >
          No se pudo enviar tu mensaje. Intenta nuevamente.
          <span style={{ display: "block" }}>{error.message}</span>
        </p>
      )}

      {messages.some((message) => message.role === "agent" && message.cards.length > 0) && <TmdbCredits />}
      <InputBar
        onSend={(text) => {
          void sendMessage(text);
        }}
        disabled={isSending}
        theme={theme}
        {...(placeholder !== undefined ? { placeholder } : {})}
      />
    </section>
  );
};
