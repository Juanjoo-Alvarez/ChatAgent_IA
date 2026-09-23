import type { CSSProperties, ReactElement } from "react";

import type { ITransportAdapter, Session } from "@agichat/core";

import { useChat } from "../../hooks/useChat";
import {
  resolveTheme,
  type AGIChatTheme,
  type AGIChatThemeOverride
} from "../../theme";
import { AgentIcon } from "../icons";
import { InputBar } from "../InputBar/InputBar";
import { MessageBubble } from "../MessageBubble/MessageBubble";

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

const widgetStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  width: "min(100%, 420px)",
  maxWidth: 420,
  height: "min(640px, 100dvh)",
  minHeight: "min(420px, 100dvh)",
  maxHeight: "100dvh",
  border: `1px solid ${theme.widgetBorder}`,
  borderRadius: theme.widgetRadius,
  overflow: "hidden",
  backgroundColor: theme.widgetBackground,
  fontFamily: theme.fontFamily,
  boxShadow: theme.widgetShadow,
  color: theme.agentBubbleText
});

const headerStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacingMedium,
  padding: `${theme.spacingMedium + 4}px ${theme.spacingLarge}px`,
  background: theme.headerBackground,
  color: theme.headerText
});

const headerAvatarStyle = (theme: AGIChatTheme): CSSProperties => ({
  position: "relative",
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  width: 42,
  height: 42,
  borderRadius: 14,
  color: theme.agentAvatarText,
  backgroundColor: theme.agentAvatarBackground,
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.2)"
});

const onlineIndicatorStyle = (theme: AGIChatTheme): CSSProperties => ({
  position: "absolute",
  right: -2,
  bottom: -2,
  width: 11,
  height: 11,
  borderRadius: "50%",
  backgroundColor: theme.onlineIndicator,
  border: `2px solid ${theme.headerAvatarBorder}`
});

const headerCopyStyle: CSSProperties = {
  display: "flex",
  minWidth: 0,
  flexDirection: "column",
  gap: 2
};

const titleStyle = (theme: AGIChatTheme): CSSProperties => ({
  fontSize: theme.fontSize + 2,
  fontWeight: 700,
  lineHeight: 1.2
});

const subtitleStyle = (theme: AGIChatTheme): CSSProperties => ({
  fontSize: theme.smallFontSize,
  lineHeight: 1.3,
  color: theme.headerMutedText
});

const messageListStyle = (theme: AGIChatTheme): CSSProperties => ({
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: theme.spacingSmall,
  padding: `${theme.spacingLarge}px ${theme.spacingMedium}px`,
  scrollbarWidth: "thin"
});

const typingIndicatorStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  alignSelf: "flex-start",
  gap: 8,
  margin: `0 ${theme.spacingMedium}px 10px`,
  padding: `${theme.spacingSmall}px ${theme.spacingMedium}px`,
  borderRadius: 14,
  backgroundColor: theme.agentBubbleBackground,
  fontSize: theme.smallFontSize,
  color: theme.mutedText,
  boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)"
});

const typingDotsStyle: CSSProperties = {
  display: "inline-flex",
  gap: 3,
  alignItems: "center"
};

const typingDotStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "block",
  width: 5,
  height: 5,
  borderRadius: "50%",
  backgroundColor: theme.mutedText
});

const errorBannerStyle = (theme: AGIChatTheme): CSSProperties => ({
  margin: `0 ${theme.spacingMedium}px 10px`,
  padding: `9px ${theme.spacingMedium}px`,
  borderRadius: 10,
  fontSize: theme.smallFontSize,
  color: theme.errorText,
  backgroundColor: theme.errorBackground
});

const emptyStateStyle = (theme: AGIChatTheme): CSSProperties => ({
  margin: "auto",
  maxWidth: 280,
  color: theme.mutedText,
  fontSize: theme.fontSize - 1,
  lineHeight: 1.55,
  textAlign: "center",
  padding: "24px"
});

/**
 * Vista principal del SDK. Recibe el transporte por inyección y delega todo el
 * estado conversacional al hook para mantener el componente presentacional.
 */
export const ChatWidget = ({
  transport,
  session,
  sessionId,
  title = "AGIChat",
  subtitle = "Asistente virtual · En línea",
  placeholder,
  emptyStateMessage = "Escribe un mensaje para comenzar la conversación.",
  theme: themeOverride
}: ChatWidgetProps): ReactElement => {
  // Cada override se combina con el tema base antes de calcular estilos.
  const theme = resolveTheme(themeOverride);
  const { messages, isAgentTyping, isSending, error, sendMessage } = useChat({
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
            style={onlineIndicatorStyle(theme)}
          />
        </span>
        <span style={headerCopyStyle}>
          <span style={titleStyle(theme)}>{title}</span>
          <span style={subtitleStyle(theme)}>{subtitle}</span>
        </span>
      </header>

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
        </p>
      )}

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
