import type { CSSProperties, ReactElement } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";

import type { Message } from "@agichat/core";

import {
  resolveTheme,
  type AGIChatTheme,
  type AGIChatThemeOverride
} from "../../theme";
import { AgentIcon } from "../icons";

// react-markdown no interpreta HTML crudo por defecto (no se usa rehype-raw),
// por lo que el contenido del agente se renderiza de forma segura sin abrir
// una vía de inyección de HTML/XSS.
const markdownComponents = (theme: AGIChatTheme): Components => ({
  p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
  ul: ({ children }) => (
    <ul style={{ margin: "6px 0", paddingLeft: 20 }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: "6px 0", paddingLeft: 20 }}>{children}</ol>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: theme.accent, fontWeight: 600 }}
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: "8px 0",
        paddingLeft: 10,
        borderLeft: `3px solid ${theme.accent}`,
        color: theme.mutedText
      }}
    >
      {children}
    </blockquote>
  )
});

export interface MessageBubbleProps {
  readonly message: Message;
  readonly theme?: AGIChatThemeOverride;
}

const rowStyle = (isUser: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "flex-end",
  gap: 8,
  justifyContent: isUser ? "flex-end" : "flex-start",
  padding: "2px 0"
});

const avatarStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  width: 30,
  height: 30,
  borderRadius: theme.controlRadius - 3,
  color: theme.agentAvatarText,
  backgroundColor: theme.agentAvatarBackground
});

const bubbleStyle = (
  theme: AGIChatTheme,
  isUser: boolean
): CSSProperties => ({
  maxWidth: "78%",
  borderRadius: isUser
    ? `${theme.bubbleRadius}px ${theme.bubbleRadius}px 4px ${theme.bubbleRadius}px`
    : `${theme.bubbleRadius}px ${theme.bubbleRadius}px ${theme.bubbleRadius}px 4px`,
  padding: "10px 13px",
  fontSize: theme.fontSize,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  backgroundColor: isUser
    ? theme.userBubbleBackground
    : theme.agentBubbleBackground,
  color: isUser ? theme.userBubbleText : theme.agentBubbleText,
  boxShadow: isUser
    ? `0 6px 16px ${theme.focusRing}`
    : "0 3px 14px rgba(15, 23, 42, 0.07)"
});

const statusStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "block",
  marginTop: 4,
  fontSize: theme.smallFontSize - 1
});

export const MessageBubble = ({
  message,
  theme: themeOverride
}: MessageBubbleProps): ReactElement => {
  const theme = resolveTheme(themeOverride);
  const isUser = message.role === "user";

  return (
    <div
      className={`agichat-message agichat-message--${message.role}`}
      style={rowStyle(isUser)}
      data-testid="message-bubble"
      data-role={message.role}
      data-status={message.status}
    >
      {!isUser && (
        <span
          className="agichat-message__avatar"
          style={avatarStyle(theme)}
          data-testid="agent-avatar"
        >
          <AgentIcon />
        </span>
      )}
      <div
        className="agichat-message__bubble"
        style={bubbleStyle(theme, isUser)}
        role="article"
        aria-label={isUser ? "Mensaje enviado" : "Mensaje del agente"}
      >
        <div className="agichat-message__content">
          {isUser ? (
            message.content
          ) : (
            <Markdown components={markdownComponents(theme)}>
              {message.content}
            </Markdown>
          )}
        </div>
        {message.status === "sending" && (
          <span
            className="agichat-message__status"
            style={{ ...statusStyle(theme), color: theme.headerMutedText }}
          >
            Enviando…
          </span>
        )}
        {message.status === "error" && (
          <span
            className="agichat-message__status"
            style={{ ...statusStyle(theme), color: theme.errorText }}
          >
            No se pudo enviar el mensaje.
          </span>
        )}
      </div>
    </div>
  );
};
