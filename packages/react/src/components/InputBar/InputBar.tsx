import { useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactElement } from "react";

import { defaultTheme } from "../../theme";

export interface InputBarProps {
  readonly onSend: (text: string) => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
}

const formStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-end",
  padding: 8,
  borderTop: `1px solid ${defaultTheme.inputBorder}`,
  backgroundColor: defaultTheme.inputBackground
};

const textareaStyle: CSSProperties = {
  flex: 1,
  resize: "none",
  minHeight: 40,
  maxHeight: 120,
  padding: "8px 10px",
  borderRadius: 10,
  border: `1px solid ${defaultTheme.inputBorder}`,
  fontFamily: defaultTheme.fontFamily,
  fontSize: 14,
  lineHeight: 1.4
};

const buttonStyle = (isDisabled: boolean): CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 10,
  border: "none",
  backgroundColor: defaultTheme.accent,
  color: defaultTheme.accentText,
  fontSize: 14,
  fontWeight: 600,
  cursor: isDisabled ? "not-allowed" : "pointer",
  opacity: isDisabled ? 0.6 : 1
});

export const InputBar = ({
  onSend,
  disabled = false,
  placeholder = "Escribe un mensaje…"
}: InputBarProps): ReactElement => {
  const [value, setValue] = useState("");

  const trySend = (): void => {
    const trimmed = value.trim();

    if (trimmed.length === 0 || disabled) {
      return;
    }

    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      trySend();
    }
  };

  const isSendDisabled = disabled || value.trim().length === 0;

  return (
    <form
      className="agichat-input-bar"
      style={formStyle}
      onSubmit={(event) => {
        event.preventDefault();
        trySend();
      }}
    >
      <textarea
        className="agichat-input-bar__textarea"
        style={textareaStyle}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Mensaje"
      />
      <button
        type="submit"
        className="agichat-input-bar__send"
        style={buttonStyle(isSendDisabled)}
        disabled={isSendDisabled}
      >
        Enviar
      </button>
    </form>
  );
};
