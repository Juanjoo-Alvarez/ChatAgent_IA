import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MockTransportAdapter } from "@agichat/react";

import {
  AGICHAT_WIDGET_TAG,
  AGIChatWidgetElement,
  registerAGIChatWidget,
  type AGIChatTransport
} from "../src/index";

const createTransport = (): AGIChatTransport => ({
  sendMessage: vi.fn(() => Promise.resolve()),
  subscribe: vi.fn(() => () => undefined)
});

const appendWidget = (element: AGIChatWidgetElement): void => {
  act(() => {
    document.body.append(element);
  });
};

afterEach(() => {
  act(() => {
    document.body.replaceChildren();
  });

  vi.restoreAllMocks();
});

describe("AGIChatWidgetElement", () => {
  it("exposes full layout and sends welcome suggestions from Shadow DOM", async () => {
    const element = new AGIChatWidgetElement();
    const transport = createTransport();
    element.transport = transport;
    element.setAttribute("layout", "full");
    element.setAttribute("welcome-title", "Hola, soy Sofía.");
    element.suggestions = [{ label: "Una película", prompt: "Recomiéndame una película." }];
    appendWidget(element);
    expect(element.shadowRoot?.querySelector(".agichat-widget--full")).not.toBeNull();
    expect(element.shadowRoot?.querySelector("h2")?.textContent).toBe("Hola, soy Sofía.");
    const suggestion = element.shadowRoot?.querySelector<HTMLButtonElement>(".agichat-welcome__suggestion");
    await act(async () => { suggestion?.click(); });
    expect(transport.sendMessage).toHaveBeenCalledWith("Recomiéndame una película.");
    expect(element.shadowRoot?.querySelector("textarea")?.value).toBe("");
    expect(element.suggestions).toHaveLength(1);
    act(() => {
      element.suggestions = [];
      element.setAttribute("welcome-title", "¿Qué te gustaría descubrir?");
      element.setAttribute("layout", "compact");
    });
    expect(element.shadowRoot?.querySelector(".agichat-widget--full")).toBeNull();
    expect(element.shadowRoot?.querySelector(".agichat-welcome__suggestion")).toBeNull();
    expect(element.getAttribute("welcome-title")).toBe("¿Qué te gustaría descubrir?");
    expect(element.shadowRoot?.textContent).toContain("Recomiéndame una película.");
  });

  it("registers itself once using the public custom element tag", () => {
    expect(customElements.get(AGICHAT_WIDGET_TAG)).toBe(AGIChatWidgetElement);
    expect(registerAGIChatWidget()).toBe(AGIChatWidgetElement);
  });

  it("renders configured attributes inside an isolated shadow root", () => {
    const element = document.createElement(
      AGICHAT_WIDGET_TAG
    ) as AGIChatWidgetElement;
    element.setAttribute("title", "Embedded support");
    element.setAttribute("session-id", "session-123");
    element.setAttribute("placeholder", "Write here");
    element.setAttribute("empty-state-message", "Start a conversation");

    appendWidget(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.textContent).toContain("Embedded support");
    expect(element.shadowRoot?.textContent).toContain("Start a conversation");
    expect(
      element.shadowRoot?.querySelector("textarea")?.getAttribute("placeholder")
    ).toBe("Write here");
  });

  it("updates the widget when an observed attribute changes", () => {
    const element = new AGIChatWidgetElement();
    appendWidget(element);

    act(() => {
      element.setAttribute("title", "Updated title");
    });

    expect(element.shadowRoot?.textContent).toContain("Updated title");
  });

  it("applies a theme configured through the element property", () => {
    const element = new AGIChatWidgetElement();
    element.theme = {
      widgetBackground: "#fff7ed",
      headerBackground: "#7c2d12"
    };

    appendWidget(element);

    const widget = element.shadowRoot?.querySelector<HTMLElement>(
      "[data-testid='chat-widget']"
    );
    expect(widget?.style.backgroundColor).toBe("rgb(255, 247, 237)");

    act(() => {
      element.theme = { accent: "#0f766e" };
    });

    expect(element.theme).toEqual({ accent: "#0f766e" });
  });

  it("uses an injected transport without taking ownership of it", () => {
    const element = new AGIChatWidgetElement();
    const dispose = vi.fn();
    const transport = { ...createTransport(), dispose };

    element.transport = transport;
    element.transport = transport;
    appendWidget(element);

    expect(element.transport).toBe(transport);

    act(() => {
      element.remove();
    });

    expect(element.shadowRoot?.querySelector("[data-agichat-root]")?.children).toHaveLength(0);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("creates a fresh default transport after reconnecting", () => {
    const element = new AGIChatWidgetElement();
    const dispose = vi.spyOn(MockTransportAdapter.prototype, "dispose");
    const firstTransport = element.transport;

    appendWidget(element);

    act(() => {
      element.remove();
      document.body.append(element);
    });

    expect(element.transport).not.toBe(firstTransport);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
