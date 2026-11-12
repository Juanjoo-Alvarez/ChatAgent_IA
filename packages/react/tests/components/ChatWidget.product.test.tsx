import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatWidget } from "../../src/components/ChatWidget/ChatWidget";
import { FakeTransportAdapter } from "../fakes/FakeTransportAdapter";

describe("Movie widget experience", () => {
  it("shows actual connection state, fixture mode and capabilities", () => {
    const transport = new FakeTransportAdapter();
    render(<ChatWidget transport={transport} />);
    act(() => transport.emit({ type: "connection-state", status: "connecting" }));
    expect(screen.getByText("Conectando…")).toBeVisible();
    act(() => {
      transport.emit({ type: "session-ready", notice: "Puedo comparar películas con libros.", mode: "fixture" });
      transport.emit({ type: "connection-state", status: "connected" });
    });
    expect(screen.getByText("Modo de prueba · En línea")).toBeVisible();
    expect(screen.getByText("Puedo comparar películas con libros.")).toBeVisible();
    act(() => transport.emit({ type: "connection-state", status: "disconnected" }));
    expect(screen.getByText("Sin conexión")).toBeVisible();
  });
  it("shows credits with movie recommendations and exposes asynchronous failures", () => {
    const transport = new FakeTransportAdapter();
    render(<ChatWidget transport={transport} />);
    expect(screen.queryByLabelText("Créditos de TMDB")).toBeNull();
    act(() => transport.emit({ type: "agent-message", message: {
      id: "movie", content: "Te recomiendo esta película.", timestamp: new Date(),
      cards: [{ id: "1", title: "Película", subtitle: null, image: null }]
    } }));
    expect(screen.getByLabelText("Créditos de TMDB")).toBeVisible();
    expect(screen.getByText("Póster no disponible")).toBeVisible();
    act(() => transport.emit({ type: "transport-error", error: new Error("La sesión expiró.") }));
    expect(screen.getByRole("alert")).toHaveTextContent("La sesión expiró.");
  });
});
