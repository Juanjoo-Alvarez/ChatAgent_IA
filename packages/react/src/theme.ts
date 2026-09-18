export interface AGIChatTheme {
  readonly fontFamily: string;
  readonly widgetBackground: string;
  readonly widgetBorder: string;
  readonly userBubbleBackground: string;
  readonly userBubbleText: string;
  readonly agentBubbleBackground: string;
  readonly agentBubbleText: string;
  readonly errorText: string;
  readonly mutedText: string;
  readonly inputBackground: string;
  readonly inputBorder: string;
  readonly accent: string;
  readonly accentText: string;
}

export const defaultTheme: AGIChatTheme = {
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  widgetBackground: "#ffffff",
  widgetBorder: "#e2e5eb",
  userBubbleBackground: "#4f46e5",
  userBubbleText: "#ffffff",
  agentBubbleBackground: "#f1f2f6",
  agentBubbleText: "#1f2430",
  errorText: "#c62828",
  mutedText: "#6b7280",
  inputBackground: "#ffffff",
  inputBorder: "#d7dae1",
  accent: "#4f46e5",
  accentText: "#ffffff"
};
