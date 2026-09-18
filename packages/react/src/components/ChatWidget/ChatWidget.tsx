import type { CSSProperties, ReactElement } from "react";

import type { ITransportAdapter, Session } from "@agichat/core";

import { useChat } from "../../hooks/useChat";
import { defaultTheme } from "../../theme";
import { InputBar } from "../InputBar/InputBar";
import { MessageBubble } from "../MessageBubble/MessageBubble";

export interface ChatWidgetProps {
  readonly transport: ITransportAdapter;
  readonly session?: Session;
  readonly sessionId?: string;
  readonly title?: string;
  readonly placeholder?: string;
  readonly emptyStateMessage?: string;
}

const widgetStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: 420,
  height: 560,
  border: `1px solid ${defaultTheme.widgetBorder}`,
  borderRadius: 16,
  overflow: "hidden",
  backgroundColor: defaultTheme.widgetBackground,
  fontFamily: defaultTheme.fontFamily,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)"
};

const headerStyle: CSSProperties = {
  padding: "12px 16px",
  borderBottom: `1px solid ${defaultTheme.widgetBorder}`,
  fontSize: 15,
  fontWeight: 600,
  color: defaultTheme.agentBubbleText
};

const messageListStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "12px 4px"
};

const typingIndicatorStyle: CSSProperties = {
  padding: "0 12px 4px",
  fontSize: 12,
  color: defaultTheme.mutedText
};

const errorBannerStyle: CSSProperties = {
  padding: "6px 16px",
  fontSize: 12,
  color: defaultTheme.errorText
};

const emptyStateStyle: CSSProperties = {
  margin: "auto",
  color: defaultTheme.mutedText,
  fontSize: 13,
  textAlign: "center",
  padding: "0 24px"
};

export const ChatWidget = ({
  transport,
  session,
  sessionId,
  title = "AGIChat",
  placeholder,
  emptyStateMessage = "Escribe un mensaje para comenzar la conversación."
}: ChatWidgetProps): ReactElement => {
  const { messages, isAgentTyping, isSending, error, sendMessage } = useChat({
    transport,
    ...(session !== undefined ? { session } : {}),
    ...(sessionId !== undefined ? { sessionId } : {})
  });

  return (
    <section className="agichat-widget" style={widgetStyle} aria-label={title}>
      <header className="agichat-widget__header" style={headerStyle}>
        {title}
      </header>

      <div
        className="agichat-widget__messages"
        style={messageListStyle}
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="agichat-widget__empty-state" style={emptyStateStyle}>
            {emptyStateMessage}
          </p>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
      </div>

      {isAgentTyping && (
        <p className="agichat-widget__typing" style={typingIndicatorStyle}>
          El agente está escribiendo…
        </p>
      )}

      {error !== null && (
        <p className="agichat-widget__error" role="alert" style={errorBannerStyle}>
          No se pudo enviar tu mensaje. Intenta nuevamente.
        </p>
      )}

      <InputBar
        onSend={(text) => {
          void sendMessage(text);
        }}
        disabled={isSending}
        {...(placeholder !== undefined ? { placeholder } : {})}
      />
    </section>
  );
};
