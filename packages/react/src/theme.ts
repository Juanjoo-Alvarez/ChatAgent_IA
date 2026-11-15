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

// Paleta y medidas que se aplican cuando el integrador no proporciona un tema.
export const defaultTheme: AGIChatTheme = {
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontSize: 14,
  smallFontSize: 12,
  spacingSmall: 8,
  spacingMedium: 12,
  spacingLarge: 18,
  widgetRadius: 22,
  bubbleRadius: 20,
  controlRadius: 22,
  widgetBackground: "#ffffff",
  widgetBorder: "#e4e9e6",
  widgetShadow: "none",
  headerBackground: "#ffffff",
  headerText: "#243b33",
  headerMutedText: "#626d67",
  headerAvatarBorder: "#ffffff",
  onlineIndicator: "#1b6e66",
  userBubbleBackground: "#edf3ef",
  userBubbleText: "#243b33",
  agentBubbleBackground: "#ffffff",
  agentBubbleText: "#243b33",
  agentAvatarBackground: "#e6efea",
  agentAvatarText: "#24594c",
  errorText: "#b91c1c",
  errorBackground: "#fef2f2",
  mutedText: "#626d67",
  inputBackground: "#ffffff",
  inputBorder: "#cbd6cf",
  inputText: "#243b33",
  accent: "#1b6e66",
  accentText: "#ffffff",
  focusRing: "rgba(27, 110, 102, 0.24)"
};

// Completar sobre los valores predeterminados permite personalizaciones
// parciales sin propagar propiedades indefinidas a los componentes.
export const resolveTheme = (
  override: AGIChatThemeOverride = {}
): AGIChatTheme => Object.freeze({ ...defaultTheme, ...override });
