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

  describe("Markdown rendering for agent messages", () => {
    it("renders bold text as a <strong> element", () => {
      render(
        <MessageBubble
          message={buildMessage({ role: "agent", content: "Esto es **importante**" })}
        />
      );

      const strong = screen.getByText("importante");
      expect(strong.tagName).toBe("STRONG");
    });

    it("renders a markdown list as <ul>/<li> elements", () => {
      render(
        <MessageBubble
          message={buildMessage({
            role: "agent",
            content: "Opciones:\n\n- Primera opción\n- Segunda opción"
          })}
        />
      );

      const list = screen.getByRole("list");
      const items = screen.getAllByRole("listitem");
      expect(list.tagName).toBe("UL");
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("Primera opción");
      expect(items[1]).toHaveTextContent("Segunda opción");
    });

    it("renders a markdown ordered list as an <ol> element", () => {
      render(
        <MessageBubble
          message={buildMessage({
            role: "agent",
            content: "Pasos:\n\n1. Primero\n2. Segundo"
          })}
        />
      );

      const list = screen.getByRole("list");
      expect(list.tagName).toBe("OL");
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    it("renders a markdown link as a safe, blank-target <a> element", () => {
      render(
        <MessageBubble
          message={buildMessage({
            role: "agent",
            content: "Visita [AGIChat](https://agichat.example.com)"
          })}
        />
      );

      const link = screen.getByRole("link", { name: "AGIChat" });
      expect(link).toHaveAttribute("href", "https://agichat.example.com");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders a heading as an <h2> element", () => {
      render(
        <MessageBubble message={buildMessage({ role: "agent", content: "## Hola" })} />
      );

      expect(screen.getByRole("heading", { level: 2, name: "Hola" })).toBeInTheDocument();
    });
  });

  it("renders user message content as plain text without interpreting markdown syntax", () => {
    render(
      <MessageBubble
        message={buildMessage({ role: "user", content: "Esto **no** debería ser negrita" })}
      />
    );

    expect(
      screen.getByText("Esto **no** debería ser negrita")
    ).toBeInTheDocument();
    expect(screen.queryByText("no")).not.toBeInTheDocument();
    expect(document.querySelector("strong")).not.toBeInTheDocument();
  });
});
