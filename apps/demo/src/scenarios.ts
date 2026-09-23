import { MockTransportAdapter } from "@agichat/react";
import type { AGIChatThemeOverride } from "@agichat/react";

export interface DemoScenario {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly title: string;
  readonly placeholder?: string;
  readonly theme?: AGIChatThemeOverride;
  readonly createTransport: () => MockTransportAdapter;
}

const customTheme: AGIChatThemeOverride = {
  accent: "#c026d3",
  accentText: "#ffffff",
  headerBackground: "linear-gradient(135deg, #581c87 0%, #c026d3 100%)",
  headerText: "#ffffff",
  headerMutedText: "#f5d0fe",
  userBubbleBackground: "#c026d3",
  focusRing: "rgba(192, 38, 211, 0.25)"
};

const basicScenario: DemoScenario = {
  id: "basico",
  label: "Chat básico",
  description:
    "Conversación exitosa con el mock por defecto. Prueba preguntar “¿cuál es la respuesta a la vida, el universo y todo?”.",
  title: "AGIChat",
  createTransport: () => new MockTransportAdapter()
};

const errorScenario: DemoScenario = {
  id: "error",
  label: "Manejo de error",
  description:
    "El transporte simulado rechaza cada envío para mostrar el banner de error del widget.",
  title: "AGIChat · Error",
  placeholder: "Escribe algo y observa el error…",
  createTransport: () => new MockTransportAdapter({ mode: "error" })
};

const timeoutScenario: DemoScenario = {
  id: "timeout",
  label: "Timeout",
  description:
    "El transporte simulado nunca responde dentro del límite configurado (4 s), para mostrar cómo reacciona el widget cuando el backend no contesta.",
  title: "AGIChat · Timeout",
  placeholder: "Escribe algo y espera el timeout…",
  createTransport: () =>
    new MockTransportAdapter({ mode: "timeout", timeoutMs: 4_000 })
};

const themeScenario: DemoScenario = {
  id: "tema",
  label: "Tema personalizado",
  description:
    "El mismo mock exitoso, con una paleta distinta aplicada mediante la prop/propiedad theme.",
  title: "AGIChat · Tema",
  theme: customTheme,
  createTransport: () => new MockTransportAdapter()
};

// Cuatro casos de uso sobre el mismo MockTransportAdapter, compartidos por la
// demo de React (index.html) y la demo del Web Component (web-component.html).
export const demoScenarios: readonly DemoScenario[] = [
  basicScenario,
  errorScenario,
  timeoutScenario,
  themeScenario
];

export const defaultScenario: DemoScenario = basicScenario;

export const findScenario = (scenarioId: string): DemoScenario =>
  demoScenarios.find((scenario) => scenario.id === scenarioId) ??
  defaultScenario;
