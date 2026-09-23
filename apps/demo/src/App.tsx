import { useEffect, useState, type ReactElement } from "react";

import { ChatWidget } from "@agichat/react";
import type { MockTransportAdapter } from "@agichat/react";

import { demoScenarios, defaultScenario, findScenario, type DemoScenario } from "./scenarios";

interface ScenarioChatWidgetProps {
  readonly scenario: DemoScenario;
}

/**
 * Instancia dedicada por escenario. El padre la monta con `key={scenario.id}`,
 * así que React la desmonta y crea una nueva por completo en cada cambio de
 * pestaña, en vez de re-renderizarla con un `transport` distinto: eso evita
 * que `ChatWidget` (vía `useChat`) intente re-suscribirse a un transporte que
 * el padre ya empezó a liberar en un efecto separado.
 */
const ScenarioChatWidget = ({ scenario }: ScenarioChatWidgetProps): ReactElement | null => {
  const [transport, setTransport] = useState<MockTransportAdapter | null>(null);

  useEffect(() => {
    // El transporte se crea dentro del efecto (no en el render ni en un
    // inicializador de estado) para que el doble montaje de React Strict
    // Mode en desarrollo cree una instancia nueva en cada pasada en vez de
    // reutilizar una que su propia limpieza ya haya liberado.
    const created = scenario.createTransport();
    setTransport(created);

    return () => {
      created.dispose();
    };
  }, [scenario]);

  if (transport === null) {
    return null;
  }

  return (
    <ChatWidget
      transport={transport}
      sessionId={scenario.id}
      title={scenario.title}
      {...(scenario.placeholder !== undefined
        ? { placeholder: scenario.placeholder }
        : {})}
      {...(scenario.theme !== undefined ? { theme: scenario.theme } : {})}
    />
  );
};

export const App = (): ReactElement => {
  const [scenarioId, setScenarioId] = useState(defaultScenario.id);
  const scenario = findScenario(scenarioId);

  return (
    <main className="demo-layout">
      <header className="demo-header">
        <h1>AGIChat Widget SDK — Demo</h1>
        <p>
          Cada pestaña monta el mismo <code>ChatWidget</code> de{" "}
          <code>@agichat/react</code> con un <code>MockTransportAdapter</code>{" "}
          distinto.
        </p>
      </header>

      <nav className="demo-tabs" aria-label="Casos de uso de la demo">
        {demoScenarios.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === scenario.id}
            onClick={() => setScenarioId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <p className="demo-description">{scenario.description}</p>

      <section className="demo-widget">
        <ScenarioChatWidget key={scenario.id} scenario={scenario} />
      </section>

      <footer className="demo-footer">
        <p>
          ¿Prefieres verlo sin React? Los mismos casos de uso están en{" "}
          <a href="./web-component.html">web-component.html</a>, usando el
          Web Component <code>&lt;agi-chat-widget&gt;</code> de{" "}
          <code>@agichat/embed</code>.
        </p>
      </footer>
    </main>
  );
};
