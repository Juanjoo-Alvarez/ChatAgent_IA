export interface AGIChatTheme {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly smallFontSize: number;
  readonly spacingSmall: number;
  readonly spacingMedium: number;
  readonly spacingLarge: number;
  readonly widgetRadius: number;
  readonly bubbleRadius: number;
  readonly controlRadius: number;
  readonly widgetBackground: string;
  readonly widgetBorder: string;
  readonly widgetShadow: string;
  readonly headerBackground: string;
  readonly headerText: string;
  readonly headerMutedText: string;
  readonly headerAvatarBorder: string;
  readonly onlineIndicator: string;
  readonly userBubbleBackground: string;
  readonly userBubbleText: string;
  readonly agentBubbleBackground: string;
  readonly agentBubbleText: string;
  readonly agentAvatarBackground: string;
  readonly agentAvatarText: string;
  readonly errorText: string;
  readonly errorBackground: string;
  readonly mutedText: string;
  readonly inputBackground: string;
  readonly inputBorder: string;
  readonly inputText: string;
  readonly accent: string;
  readonly accentText: string;
  readonly focusRing: string;
}

export type AGIChatThemeOverride = Partial<AGIChatTheme>;

export const defaultTheme: AGIChatTheme = {
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontSize: 14,
  smallFontSize: 12,
  spacingSmall: 8,
  spacingMedium: 12,
  spacingLarge: 18,
  widgetRadius: 20,
  bubbleRadius: 16,
  controlRadius: 13,
  widgetBackground: "#f8fafc",
  widgetBorder: "#dbe3ef",
  widgetShadow: "0 24px 64px rgba(15, 23, 42, 0.18)",
  headerBackground: "linear-gradient(135deg, #172554 0%, #312e81 100%)",
  headerText: "#ffffff",
  headerMutedText: "#c7d2fe",
  headerAvatarBorder: "#312e81",
  onlineIndicator: "#34d399",
  userBubbleBackground: "#4f46e5",
  userBubbleText: "#ffffff",
  agentBubbleBackground: "#ffffff",
  agentBubbleText: "#1e293b",
  agentAvatarBackground: "#e0e7ff",
  agentAvatarText: "#3730a3",
  errorText: "#b91c1c",
  errorBackground: "#fef2f2",
  mutedText: "#64748b",
  inputBackground: "#ffffff",
  inputBorder: "#cbd5e1",
  inputText: "#0f172a",
  accent: "#4f46e5",
  accentText: "#ffffff",
  focusRing: "rgba(79, 70, 229, 0.22)"
};

export const resolveTheme = (
  override: AGIChatThemeOverride = {}
): AGIChatTheme => Object.freeze({ ...defaultTheme, ...override });
