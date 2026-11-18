import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChatWidget } from "../../src/components/ChatWidget/ChatWidget";
import { FakeTransportAdapter } from "../fakes/FakeTransportAdapter";

const suggestions = [
  { label: "Una película", prompt: "Recomiéndame una película.", description: "Algo para hoy." },
  { label: "Un libro", prompt: "Busco un libro." }
];

function reply(transport: FakeTransportAdapter, id: string) {
  act(() => transport.emit({ type: "agent-message", message: { id, content: `Respuesta ${id}`, timestamp: new Date() } }));
}

describe("Chat welcome and reading experience", () => {
  it("sends a welcome suggestion in one click", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransportAdapter();
    render(<ChatWidget transport={transport} layout="full" welcomeTitle="Hola, soy Sofía." suggestions={suggestions} theme={{ focusRing: "rgb(1, 2, 3)" }} />);
    expect(screen.getByRole("heading", { name: "Hola, soy Sofía." })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Una película/ }));
    const textbox = screen.getByRole("textbox", { name: "Mensaje" });
    expect(transport.sentContents).toEqual(["Recomiéndame una película."]);
    expect(textbox).toHaveValue("");
    expect(screen.queryByRole("group", { name: "Ideas para empezar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hola, soy Sofía." })).not.toBeInTheDocument();
  });

  it("keeps a typed draft available after sending a suggestion", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransportAdapter();
    render(<ChatWidget transport={transport} suggestions={suggestions} />);
    await user.type(screen.getByRole("textbox"), "Mi borrador");
    await user.click(screen.getByRole("button", { name: "Un libro" }));
    expect(transport.sentContents).toEqual(["Busco un libro."]);
    expect(screen.getByRole("textbox")).toHaveValue("Mi borrador");
  });

  it("clears the previous conversation and draft when changing sessions", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransportAdapter();
    const { rerender } = render(<ChatWidget transport={transport} sessionId="first" />);
    reply(transport, "first");
    await user.type(screen.getByRole("textbox"), "Un borrador");
    rerender(<ChatWidget transport={transport} sessionId="second" />);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.queryByText("Respuesta first")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "¿En qué puedo ayudarte?" })).toBeVisible();
    expect(transport.subscriberCount).toBe(1);
  });

  it("follows new replies near the bottom, and preserves the reader's position above", () => {
    const transport = new FakeTransportAdapter();
    render(<ChatWidget transport={transport} />);
    const log = screen.getByRole("log", { name: "Conversación" });
    Object.defineProperties(log, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 400 } });
    reply(transport, "1");
    expect(log.scrollTop).toBe(1000);
    log.scrollTop = 100;
    fireEvent.scroll(log);
    reply(transport, "2");
    expect(log.scrollTop).toBe(100);
    log.scrollTop = 590;
    fireEvent.scroll(log);
    reply(transport, "3");
    expect(log.scrollTop).toBe(1000);
  });

  it("returns to the latest turn when the reader sends a message", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransportAdapter();
    render(<ChatWidget transport={transport} />);
    const log = screen.getByRole("log");
    Object.defineProperties(log, { scrollHeight: { value: 1000 }, clientHeight: { value: 400 } });
    reply(transport, "1");
    log.scrollTop = 100;
    fireEvent.scroll(log);
    await user.type(screen.getByRole("textbox"), "Mi pregunta{Enter}");
    expect(log.scrollTop).toBe(1000);
  });

  it("keeps a custom subtitle and compact layout available to integrators", () => {
    render(<ChatWidget transport={new FakeTransportAdapter()} subtitle="Tu asistente" />);
    expect(screen.getByText("Tu asistente")).toBeVisible();
    expect(screen.getByTestId("chat-widget")).toHaveStyle({ maxWidth: "420px" });
    expect(screen.queryByRole("group", { name: "Ideas para empezar" })).not.toBeInTheDocument();
  });
});
