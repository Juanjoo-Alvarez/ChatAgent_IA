import type { CSSProperties, ReactElement } from "react";

import type { Message } from "@agichat/core";

import { defaultTheme } from "../../theme";

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
        <span className="agichat-message__content">{message.content}</span>
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
