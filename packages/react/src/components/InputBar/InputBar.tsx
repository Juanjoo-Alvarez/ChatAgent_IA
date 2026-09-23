import { useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactElement } from "react";

import {
  resolveTheme,
  type AGIChatTheme,
  type AGIChatThemeOverride
} from "../../theme";
import { SendIcon } from "../icons";

export interface InputBarProps {
  readonly onSend: (text: string) => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly theme?: AGIChatThemeOverride;
}

const formStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "flex",
  gap: theme.spacingSmall + 2,
  alignItems: "center",
  padding: `${theme.spacingMedium}px ${theme.spacingMedium + 2}px`,
  borderTop: `1px solid ${theme.inputBorder}`,
  backgroundColor: theme.inputBackground
});

const textareaStyle = (
  theme: AGIChatTheme,
  isFocused: boolean
): CSSProperties => ({
  flex: 1,
  resize: "none",
  boxSizing: "border-box",
  minHeight: 44,
  maxHeight: 120,
  padding: "10px 12px",
  borderRadius: theme.controlRadius,
  border: `1px solid ${theme.inputBorder}`,
  outline: "none",
  backgroundColor: theme.widgetBackground,
  color: theme.inputText,
  fontFamily: theme.fontFamily,
  fontSize: theme.fontSize,
  lineHeight: 1.45,
  boxShadow: isFocused ? `0 0 0 3px ${theme.focusRing}` : "none"
});

const buttonStyle = (
  theme: AGIChatTheme,
  isDisabled: boolean
): CSSProperties => ({
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  width: 44,
  height: 44,
  padding: 0,
  borderRadius: theme.controlRadius,
  border: "none",
  backgroundColor: theme.accent,
  color: theme.accentText,
  cursor: isDisabled ? "not-allowed" : "pointer",
  opacity: isDisabled ? 0.5 : 1,
  boxShadow: isDisabled ? "none" : `0 8px 18px ${theme.focusRing}`,
  transition: "opacity 150ms ease, transform 150ms ease"
});

export const InputBar = ({
  onSend,
  disabled = false,
  placeholder = "Escribe un mensaje…",
  theme: themeOverride
}: InputBarProps): ReactElement => {
  const theme = resolveTheme(themeOverride);
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

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
      style={formStyle(theme)}
      onSubmit={(event) => {
        event.preventDefault();
        trySend();
      }}
    >
      <textarea
        className="agichat-input-bar__textarea"
        style={textareaStyle(theme, isFocused)}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        aria-label="Mensaje"
      />
      <button
        type="submit"
        className="agichat-input-bar__send"
        style={buttonStyle(theme, isSendDisabled)}
        disabled={isSendDisabled}
        aria-label="Enviar"
        title="Enviar mensaje"
      >
        <SendIcon />
      </button>
    </form>
  );
};
