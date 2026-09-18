import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Message, type MessageProps } from "@agichat/core";

import { MessageBubble } from "../../src/components/MessageBubble/MessageBubble";

const buildMessage = (overrides: Partial<MessageProps> = {}) =>
  new Message({
    id: "msg-1",
    role: "user",
    content: "Hola, ¿cómo estás?",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    status: "sent",
    ...overrides
  });

describe("MessageBubble", () => {
  it("renders a user message aligned as sent by the user", () => {
    render(<MessageBubble message={buildMessage({ role: "user" })} />);

    const bubble = screen.getByTestId("message-bubble");
    expect(bubble).toHaveAttribute("data-role", "user");
    expect(screen.getByText("Hola, ¿cómo estás?")).toBeInTheDocument();
  });

  it("renders an agent message distinguishable from a user message", () => {
    render(
      <MessageBubble
        message={buildMessage({ role: "agent", content: "¡Hola! ¿En qué te ayudo?" })}
      />
    );

    const bubble = screen.getByTestId("message-bubble");
    expect(bubble).toHaveAttribute("data-role", "agent");
    expect(screen.getByText("¡Hola! ¿En qué te ayudo?")).toBeInTheDocument();
  });

  it("visually differentiates user and agent messages via distinct bubble roles", () => {
    const { rerender } = render(<MessageBubble message={buildMessage({ role: "user" })} />);
    expect(screen.getByRole("article", { name: "Mensaje enviado" })).toBeInTheDocument();

    rerender(<MessageBubble message={buildMessage({ role: "agent" })} />);
    expect(screen.getByRole("article", { name: "Mensaje del agente" })).toBeInTheDocument();
  });

  it("shows a sending indicator while the message status is 'sending'", () => {
    render(<MessageBubble message={buildMessage({ status: "sending" })} />);

    expect(screen.getByText("Enviando…")).toBeInTheDocument();
  });

  it("shows an error indicator when the message status is 'error'", () => {
    render(<MessageBubble message={buildMessage({ status: "error" })} />);

    expect(screen.getByText("No se pudo enviar el mensaje.")).toBeInTheDocument();
  });

  it("does not show any status indicator for a successfully sent message", () => {
    render(<MessageBubble message={buildMessage({ status: "sent" })} />);

    expect(screen.queryByText("Enviando…")).not.toBeInTheDocument();
    expect(screen.queryByText("No se pudo enviar el mensaje.")).not.toBeInTheDocument();
  });
});
