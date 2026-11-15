import { useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactElement, RefObject } from "react";

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
  readonly value?: string;
  readonly onValueChange?: (value: string) => void;
  readonly inputRef?: RefObject<HTMLTextAreaElement | null>;
}

const formStyle = (theme: AGIChatTheme, isFocused: boolean): CSSProperties => ({
  display: "flex",
  gap: theme.spacingSmall + 2,
  alignItems: "center",
  padding: "8px",
  border: `1px solid ${isFocused ? theme.accent : theme.inputBorder}`,
  borderRadius: theme.controlRadius,
  backgroundColor: theme.inputBackground,
  boxShadow: isFocused ? `0 0 0 3px ${theme.focusRing}` : "none"
});

const textareaStyle = (theme: AGIChatTheme): CSSProperties => ({
  flex: 1,
  minWidth: 0,
  resize: "none",
  boxSizing: "border-box",
  minHeight: 44,
  maxHeight: 120,
  padding: "10px 12px",
  borderRadius: theme.controlRadius,
  border: 0,
  outline: "none",
  backgroundColor: theme.inputBackground,
  color: theme.inputText,
  fontFamily: theme.fontFamily,
  fontSize: theme.fontSize,
  lineHeight: 1.45,
  boxShadow: "none"
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
  borderRadius: "50%",
  border: "none",
  backgroundColor: theme.accent,
  color: theme.accentText,
  cursor: isDisabled ? "not-allowed" : "pointer",
  opacity: isDisabled ? 0.55 : 1,
  transition: "opacity 150ms ease, transform 150ms ease"
});

export const InputBar = ({
  onSend,
  disabled = false,
  placeholder = "Escribe un mensaje…",
  theme: themeOverride,
  value: controlledValue,
  onValueChange,
  inputRef
}: InputBarProps): ReactElement => {
  const theme = resolveTheme(themeOverride);
  const [localValue, setLocalValue] = useState("");
  const value = controlledValue ?? localValue;
  const setValue = (nextValue: string): void => {
    setLocalValue(nextValue);
    onValueChange?.(nextValue);
  };
  const [isFocused, setIsFocused] = useState(false);

  const trySend = (): void => {
    // Se eliminan espacios exteriores antes de validar y enviar el contenido.
    const trimmed = value.trim();

    if (trimmed.length === 0 || disabled) {
      return;
    }

    onSend(trimmed);
    // El campo se limpia únicamente después de aceptar el envío.
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter envía; Shift+Enter conserva el comportamiento esperado de una
    // caja multilínea y agrega un salto de línea.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      trySend();
    }
  };

  const isSendDisabled = disabled || value.trim().length === 0;

  return (
    <form
      className="agichat-input-bar"
      style={formStyle(theme, isFocused)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) { setIsFocused(false); }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        trySend();
      }}
    >
      <textarea
        ref={inputRef}
        className="agichat-input-bar__textarea"
        style={textareaStyle(theme)}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Mensaje"
        rows={2}
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
