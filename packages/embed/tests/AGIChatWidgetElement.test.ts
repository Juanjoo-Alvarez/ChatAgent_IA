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
