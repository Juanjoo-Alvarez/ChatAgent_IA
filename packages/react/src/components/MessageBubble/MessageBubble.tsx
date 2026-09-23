import type { CSSProperties, ReactElement } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";

import type { Message } from "@agichat/core";

import { defaultTheme } from "../../theme";

// react-markdown no interpreta HTML crudo por defecto (no se usa rehype-raw),
// por lo que el contenido del agente se renderiza de forma segura sin abrir
// una vía de inyección de HTML/XSS.
const markdownComponents: Components = {
  p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: 20 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: 20 }}>{children}</ol>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
      {children}
    </a>
  )
};

export interface MessageBubbleProps {
  readonly message: Message;
}

const rowStyle = (isUser: boolean): CSSProperties => ({
  display: "flex",
  justifyContent: isUser ? "flex-end" : "flex-start",
  padding: "2px 4px"
});

const bubbleStyle = (isUser: boolean): CSSProperties => ({
  maxWidth: "80%",
  borderRadius: 14,
  padding: "8px 12px",
  fontSize: 14,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  backgroundColor: isUser
    ? defaultTheme.userBubbleBackground
    : defaultTheme.agentBubbleBackground,
  color: isUser ? defaultTheme.userBubbleText : defaultTheme.agentBubbleText
});

const statusStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: 11
};

export const MessageBubble = ({ message }: MessageBubbleProps): ReactElement => {
  const isUser = message.role === "user";

  return (
    <div
      className={`agichat-message agichat-message--${message.role}`}
      style={rowStyle(isUser)}
      data-testid="message-bubble"
      data-role={message.role}
      data-status={message.status}
    >
      <div
        className="agichat-message__bubble"
        style={bubbleStyle(isUser)}
        role="article"
        aria-label={isUser ? "Mensaje enviado" : "Mensaje del agente"}
      >
        <div className="agichat-message__content">
          {isUser ? (
            message.content
          ) : (
            <Markdown components={markdownComponents}>{message.content}</Markdown>
          )}
        </div>
        {message.status === "sending" && (
          <span
            className="agichat-message__status"
            style={{ ...statusStyle, color: defaultTheme.mutedText }}
          >
            Enviando…
          </span>
        )}
        {message.status === "error" && (
          <span
            className="agichat-message__status"
            style={{ ...statusStyle, color: defaultTheme.errorText }}
          >
            No se pudo enviar el mensaje.
          </span>
        )}
      </div>
    </div>
  );
};
