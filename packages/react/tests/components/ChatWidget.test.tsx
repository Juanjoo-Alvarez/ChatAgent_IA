import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ChatWidget } from "../../src/components/ChatWidget/ChatWidget";
import { FakeTransportAdapter } from "../fakes/FakeTransportAdapter";

describe("ChatWidget", () => {
  it("renders an empty state when there are no messages yet", () => {
    render(<ChatWidget transport={new FakeTransportAdapter()} />);

    expect(
      screen.getByText("Escribe un mensaje para comenzar la conversación.")
    ).toBeInTheDocument();
  });

  it("renders the widget title", () => {
    render(<ChatWidget transport={new FakeTransportAdapter()} title="Soporte AGIChat" />);

    expect(screen.getByText("Soporte AGIChat")).toBeInTheDocument();
  });

  it("sends a message through InputBar and renders it in the message list", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransportAdapter();
    render(<ChatWidget transport={transport} />);

    const textbox = screen.getByRole("textbox", { name: "Mensaje" });
    await user.type(textbox, "Hola AGIChat{Enter}");

    expect(await screen.findByText("Hola AGIChat")).toBeInTheDocument();
    expect(transport.sentContents).toEqual(["Hola AGIChat"]);
  });

  it("renders an agent reply coming from the transport", async () => {
    const transport = new FakeTransportAdapter();
    render(<ChatWidget transport={transport} />);

    act(() => {
      transport.emit({
        type: "agent-message",
        message: {
          id: "agent-1",
          content: "¡Hola! ¿En qué te ayudo?",
          timestamp: new Date("2026-08-25T10:00:00.000Z")
        }
      });
    });

    expect(await screen.findByText("¡Hola! ¿En qué te ayudo?")).toBeInTheDocument();
  });

  it("shows a typing indicator while the agent is typing", () => {
    const transport = new FakeTransportAdapter();
    render(<ChatWidget transport={transport} />);

    act(() => {
      transport.emit({ type: "agent-typing", isTyping: true });
    });

    expect(screen.getByText("El agente está escribiendo…")).toBeInTheDocument();
  });

  it("shows an error state when sending a message fails", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransportAdapter();
    transport.failNextSend(new Error("transport unavailable"));
    render(<ChatWidget transport={transport} />);

    const textbox = screen.getByRole("textbox", { name: "Mensaje" });
    await user.type(textbox, "Hola{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo enviar tu mensaje. Intenta nuevamente."
    );
  });

  it("disables the input while a message is being sent", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransportAdapter();
    const deferred = transport.deferNextSend();
    render(<ChatWidget transport={transport} />);

    const textbox = screen.getByRole("textbox", { name: "Mensaje" });
    await user.type(textbox, "Hola{Enter}");

    expect(screen.getByRole("textbox", { name: "Mensaje" })).toBeDisabled();

    act(() => {
      deferred.resolve();
    });

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Mensaje" })).toBeEnabled();
    });
  });
});
