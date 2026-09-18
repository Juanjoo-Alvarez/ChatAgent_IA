import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InputBar } from "../../src/components/InputBar/InputBar";

describe("InputBar", () => {
  it("lets the user type into the input", async () => {
    const user = userEvent.setup();
    render(<InputBar onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox", { name: "Mensaje" });
    await user.type(textbox, "Hola mundo");

    expect(textbox).toHaveValue("Hola mundo");
  });

  it("calls onSend with the trimmed message and clears the input", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<InputBar onSend={onSend} />);

    const textbox = screen.getByRole("textbox", { name: "Mensaje" });
    await user.type(textbox, "  Hola mundo  ");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("Hola mundo");
    expect(textbox).toHaveValue("");
  });

  it("sends the message when pressing Enter without Shift", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<InputBar onSend={onSend} />);

    const textbox = screen.getByRole("textbox", { name: "Mensaje" });
    await user.type(textbox, "Hola{Enter}");

    expect(onSend).toHaveBeenCalledWith("Hola");
  });

  it("does not send the message when pressing Shift+Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<InputBar onSend={onSend} />);

    const textbox = screen.getByRole("textbox", { name: "Mensaje" });
    await user.type(textbox, "Hola{Shift>}{Enter}{/Shift}");

    expect(onSend).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("Hola\n");
  });

  it("does not call onSend for an empty or whitespace-only message", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<InputBar onSend={onSend} />);

    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSend).not.toHaveBeenCalled();

    const textbox = screen.getByRole("textbox", { name: "Mensaje" });
    await user.type(textbox, "   ");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();

    await user.type(textbox, "{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the textarea and the send button while disabled", () => {
    render(<InputBar onSend={vi.fn()} disabled />);

    expect(screen.getByRole("textbox", { name: "Mensaje" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("uses a custom placeholder when provided", () => {
    render(<InputBar onSend={vi.fn()} placeholder="Pregúntame algo…" />);

    expect(screen.getByPlaceholderText("Pregúntame algo…")).toBeInTheDocument();
  });
});
