import { useEffect, useState, type ReactElement } from "react";

import { ChatWidget } from "@agichat/react";
import type { ITransportAdapter } from "@agichat/core";

import { demoScenarios, defaultScenario, findScenario } from "./scenarios";

export const App = (): ReactElement => {
  const [scenarioId, setScenarioId] = useState(defaultScenario.id);
  const scenario = findScenario(scenarioId);

  const [transport, setTransport] = useState<ITransportAdapter | null>(null);

  useEffect(() => {
    // Cada escenario es dueño de su propio MockTransportAdapter: se crea al
    // activarse y se libera al cambiar de escenario o desmontar la demo.
    const created = scenario.createTransport();
    setTransport(created);

    return () => {
      created.dispose();
    };
  }, [scenario]);

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
        {transport !== null && (
          <ChatWidget
            transport={transport}
            sessionId={scenario.id}
            title={scenario.title}
            {...(scenario.placeholder !== undefined
              ? { placeholder: scenario.placeholder }
              : {})}
            {...(scenario.theme !== undefined
              ? { theme: scenario.theme }
              : {})}
          />
        )}
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
