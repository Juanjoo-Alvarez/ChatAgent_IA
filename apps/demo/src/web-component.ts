// Importar el binding nombrado ya ejecuta el registro del Custom Element:
// el módulo se evalúa una sola vez sin importar cuántos exports se usen.
import { AGIChatWidgetElement } from "@agichat/embed";
import type { MockTransportAdapter } from "@agichat/react";

import { demoScenarios, defaultScenario, findScenario } from "./scenarios";

const widget = document.querySelector("#widget");
const tabsContainer = document.querySelector<HTMLElement>("#tabs");
const descriptionEl = document.querySelector<HTMLElement>("#description");

if (
  !(widget instanceof AGIChatWidgetElement) ||
  tabsContainer === null ||
  descriptionEl === null
) {
  throw new Error("Demo DOM structure is missing expected elements");
}

// La demo es dueña de cada transporte que inyecta: el Web Component solo
// libera el mock que crea por sí mismo, no uno recibido por propiedad.
let currentTransport: MockTransportAdapter | undefined;

const applyScenario = (scenarioId: string): void => {
  const scenario = findScenario(scenarioId);

  descriptionEl.textContent = scenario.description;
  widget.setAttribute("title", scenario.title);
  widget.setAttribute("session-id", scenario.id);

  if (scenario.placeholder !== undefined) {
    widget.setAttribute("placeholder", scenario.placeholder);
  } else {
    widget.removeAttribute("placeholder");
  }

  currentTransport?.dispose();
  const transport = scenario.createTransport();
  currentTransport = transport;
  widget.transport = transport;
  widget.theme = scenario.theme;

  for (const button of tabsContainer.querySelectorAll("button")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.scenarioId === scenario.id)
    );
  }
};

for (const scenario of demoScenarios) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = scenario.label;
  button.dataset.scenarioId = scenario.id;
  button.addEventListener("click", () => {
    applyScenario(scenario.id);
  });
  tabsContainer.append(button);
}

applyScenario(defaultScenario.id);
