import {
  AGICHAT_WIDGET_TAG,
  type AGIChatWidgetElement,
  type AGIChatWidgetTheme
} from "@agichat/embed";

import "./styles.css";

interface DemoScenario {
  readonly id: "support" | "sales" | "onboarding";
  readonly title: string;
  readonly description: string;
  readonly widgetTitle: string;
  readonly placeholder: string;
  readonly emptyStateMessage: string;
  readonly prompts: readonly string[];
  readonly theme: AGIChatWidgetTheme;
}

const scenarios: readonly DemoScenario[] = [
  {
    id: "support",
    title: "Atención al cliente",
    description:
      "Resuelve preguntas frecuentes y prepara el contexto antes de escalar una conversación.",
    widgetTitle: "Soporte de producto",
    placeholder: "Describe tu consulta…",
    emptyStateMessage: "Hola, ¿cómo podemos ayudarte hoy?",
    prompts: [
      "¿Cómo restablezco mi contraseña?",
      "¿Dónde puedo consultar mis facturas?"
    ],
    theme: {
      accent: "#4f46e5",
      focusRing: "rgba(79, 70, 229, 0.22)",
      headerBackground: "linear-gradient(135deg, #172554, #312e81)",
      userBubbleBackground: "#4f46e5"
    }
  },
  {
    id: "sales",
    title: "Asistencia comercial",
    description:
      "Presenta alternativas de producto y responde dudas iniciales de potenciales clientes.",
    widgetTitle: "Asesor de ventas",
    placeholder: "Cuéntanos qué necesitas…",
    emptyStateMessage: "Encuentra la opción adecuada para tu equipo.",
    prompts: [
      "¿Qué plan recomiendan para cinco personas?",
      "¿Puedo solicitar una demostración?"
    ],
    theme: {
      accent: "#0f766e",
      focusRing: "rgba(15, 118, 110, 0.22)",
      headerBackground: "linear-gradient(135deg, #134e4a, #0f766e)",
      userBubbleBackground: "#0f766e"
    }
  },
  {
    id: "onboarding",
    title: "Incorporación guiada",
    description:
      "Acompaña a nuevos usuarios con instrucciones breves mientras conocen el producto.",
    widgetTitle: "Guía de inicio",
    placeholder: "Pregunta por el siguiente paso…",
    emptyStateMessage: "Comencemos a configurar tu espacio de trabajo.",
    prompts: [
      "¿Cuál es el primer paso para comenzar?",
      "¿Cuál es la respuesta a la vida, el universo y todo lo demás?"
    ],
    theme: {
      accent: "#c2410c",
      focusRing: "rgba(194, 65, 12, 0.22)",
      headerBackground: "linear-gradient(135deg, #7c2d12, #c2410c)",
      userBubbleBackground: "#c2410c"
    }
  }
];

const getRequiredElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);

  if (element === null) {
    throw new Error(`Demo element was not found: ${selector}`);
  }

  return element;
};

const widget = getRequiredElement<AGIChatWidgetElement>(AGICHAT_WIDGET_TAG);
const scenarioTitle = getRequiredElement<HTMLElement>("[data-scenario-title]");
const scenarioDescription = getRequiredElement<HTMLElement>(
  "[data-scenario-description]"
);
const promptList = getRequiredElement<HTMLElement>("[data-prompt-list]");
const copyStatus = getRequiredElement<HTMLElement>("[data-copy-status]");
const scenarioButtons = document.querySelectorAll<HTMLButtonElement>(
  "[data-scenario]"
);

const copyPrompt = async (prompt: string): Promise<void> => {
  if (navigator.clipboard === undefined) {
    copyStatus.textContent = `Escribe en el chat: ${prompt}`;
    return;
  }

  try {
    await navigator.clipboard.writeText(prompt);
    copyStatus.textContent =
      "Mensaje copiado. Pégalo en el chat para probarlo.";
  } catch {
    copyStatus.textContent = `Escribe en el chat: ${prompt}`;
  }
};

const renderPrompts = (prompts: readonly string[]): void => {
  promptList.replaceChildren();

  for (const prompt of prompts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "prompt-button";
    button.textContent = prompt;
    button.addEventListener("click", () => {
      void copyPrompt(prompt);
    });
    promptList.append(button);
  }
};

const selectScenario = (scenario: DemoScenario): void => {
  widget.setAttribute("title", scenario.widgetTitle);
  widget.setAttribute("session-id", `demo-${scenario.id}`);
  widget.setAttribute("placeholder", scenario.placeholder);
  widget.setAttribute("empty-state-message", scenario.emptyStateMessage);
  widget.theme = scenario.theme;

  scenarioTitle.textContent = scenario.title;
  scenarioDescription.textContent = scenario.description;
  copyStatus.textContent = "";
  renderPrompts(scenario.prompts);

  for (const button of scenarioButtons) {
    const isSelected = button.dataset.scenario === scenario.id;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  }
};

for (const button of scenarioButtons) {
  button.addEventListener("click", () => {
    const scenario = scenarios.find(
      ({ id }) => id === button.dataset.scenario
    );

    if (scenario !== undefined) {
      selectScenario(scenario);
    }
  });
}

const initialScenario = scenarios[0];

if (initialScenario !== undefined) {
  selectScenario(initialScenario);
}
