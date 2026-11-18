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

  it("keeps enabled credits outside the conversation from the first render through session changes", () => {
    const transport = new FakeTransportAdapter();
    const { rerender } = render(<ChatWidget transport={transport} showTmdbCredits sessionId="first" />);
    const credits = screen.getByRole("complementary", { name: "Créditos de TMDB" });
    expect(credits).toBeVisible();
    expect(screen.getByRole("log")).not.toContainElement(credits);
    expect(screen.getByRole("textbox").closest("form")).not.toContainElement(credits);
    act(() => {
      transport.emit({ type: "connection-state", status: "disconnected" });
      transport.emit({ type: "agent-message", message: {
        id: "text", content: "Hola, soy Sofía.", timestamp: new Date()
      } });
    });
    expect(credits).toBeVisible();
    rerender(<ChatWidget transport={transport} showTmdbCredits sessionId="second" />);
    expect(screen.getByRole("log")).toHaveTextContent("¿En qué puedo ayudarte?");
    expect(credits).toBeVisible();
  });

  it("lets consumers explicitly hide credits even after recommendations and toggle them without losing history", () => {
    const transport = new FakeTransportAdapter();
    const { rerender } = render(<ChatWidget transport={transport} showTmdbCredits={false} />);
    expect(screen.queryByLabelText("Créditos de TMDB")).toBeNull();
    act(() => transport.emit({ type: "agent-message", message: {
      id: "movie", content: "Una película para ti.", timestamp: new Date(),
      cards: [{ id: "1", title: "Película", subtitle: null, image: null }]
    } }));
    expect(screen.queryByLabelText("Créditos de TMDB")).toBeNull();
    rerender(<ChatWidget transport={transport} showTmdbCredits />);
    expect(screen.getByLabelText("Créditos de TMDB")).toBeVisible();
    rerender(<ChatWidget transport={transport} showTmdbCredits={false} />);
    expect(screen.queryByLabelText("Créditos de TMDB")).toBeNull();
    expect(screen.getByText("Una película para ti.")).toBeVisible();
    expect(transport.subscriberCount).toBe(1);
  });
});
