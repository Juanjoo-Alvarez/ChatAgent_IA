import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGIChatWidgetElement, WebSocketTransportAdapter, type AGIChatTransport } from "../src";

type Handler = Parameters<AGIChatTransport["subscribe"]>[0];
function interactiveTransport() {
  const handlers = new Set<Handler>();
  return {
    sendMessage: vi.fn(async () => undefined),
    subscribe: vi.fn((handler: Handler) => { handlers.add(handler); return () => { handlers.delete(handler); }; }),
    dispose: vi.fn(),
    emit: (event: Parameters<Handler>[0]) => { for (const handler of handlers) { handler(event); } }
  };
}
function append(element: AGIChatWidgetElement) { act(() => { document.body.append(element); }); }
function reply(transport: ReturnType<typeof interactiveTransport>, id = "agent") {
  act(() => transport.emit({ type: "agent-message", message: { id, content: "Una película para ti.", timestamp: new Date() } }));
}
afterEach(() => {
  act(() => { document.body.replaceChildren(); });
  vi.restoreAllMocks();
});

describe("Embed connection ownership", () => {
  it("keeps history and subscription when presentation attributes and theme change", () => {
    const element = new AGIChatWidgetElement();
    const transport = interactiveTransport();
    element.transport = transport;
    append(element);
    reply(transport);
    const theme = { accent: "#0f766e" };
    act(() => {
      element.setAttribute("title", "Películas");
      element.setAttribute("placeholder", "Pregunta aquí");
      element.setAttribute("empty-state-message", "Comencemos");
      element.setAttribute("tmdb-credits", "");
      element.theme = theme;
      element.theme = theme;
    });
    expect(element.shadowRoot?.textContent).toContain("Una película para ti.");
    expect(element.shadowRoot?.textContent).toContain("Películas");
    expect(element.shadowRoot?.querySelector("[aria-label='Créditos de TMDB']")).not.toBeNull();
    expect(transport.subscribe).toHaveBeenCalledOnce();
  });

  it("replaces the engine and history when the injected transport changes, without disposing it", () => {
    const element = new AGIChatWidgetElement();
    const first = interactiveTransport();
    const second = interactiveTransport();
    element.transport = first;
    append(element);
    reply(first);
    act(() => { element.transport = second; });
    expect(element.shadowRoot?.textContent).not.toContain("Una película para ti.");
    reply(first, "late");
    expect(element.shadowRoot?.textContent).not.toContain("Una película para ti.");
    reply(second);
    expect(element.shadowRoot?.textContent).toContain("Una película para ti.");
    expect(first.dispose).not.toHaveBeenCalled();
    expect(second.subscribe).toHaveBeenCalledOnce();
  });

  it("uses the configured WebSocket endpoint and disposes owned connections", () => {
    const subscribe = vi.spyOn(WebSocketTransportAdapter.prototype, "subscribe").mockImplementation(() => () => undefined);
    const dispose = vi.spyOn(WebSocketTransportAdapter.prototype, "dispose");
    const element = new AGIChatWidgetElement();
    element.setAttribute("websocket-url", "ws://localhost:8000/chat");
    append(element);
    const first = element.transport as WebSocketTransportAdapter;
    expect(first.url.href).toBe("ws://localhost:8000/chat");
    act(() => { element.setAttribute("title", "Nuevo título"); });
    expect(element.transport).toBe(first);
    expect(subscribe).toHaveBeenCalledOnce();
    act(() => { element.setAttribute("websocket-url", "ws://localhost:8002/chat"); });
    const second = element.transport as WebSocketTransportAdapter;
    expect(second.url.href).toBe("ws://localhost:8002/chat");
    expect(dispose).toHaveBeenCalledTimes(1);
    act(() => { element.setAttribute("session-id", "another-conversation"); });
    expect(element.transport).not.toBe(second);
    expect(dispose).toHaveBeenCalledTimes(2);
    act(() => { element.remove(); });
    expect(dispose).toHaveBeenCalledTimes(3);
  });

  it("invalidates a transport cached before connection when its endpoint changes", () => {
    const element = new AGIChatWidgetElement();
    const initial = element.transport;
    element.setAttribute("websocket-url", "wss://example.test/chat");
    expect(element.transport).not.toBe(initial);
    expect(element.transport).toBeInstanceOf(WebSocketTransportAdapter);
    element.setAttribute("websocket-url", "https://example.test/chat");
    expect(() => element.transport).toThrow(TypeError);
    element.disconnectedCallback();
  });

  it("keeps the injected transport in precedence over endpoint attributes", () => {
    vi.spyOn(WebSocketTransportAdapter.prototype, "subscribe").mockImplementation(() => () => undefined);
    const element = new AGIChatWidgetElement();
    const transport = interactiveTransport();
    element.transport = transport;
    element.setAttribute("websocket-url", "wss://example.test/chat");
    append(element);
    expect(element.transport).toBe(transport);
    act(() => { element.transport = undefined; });
    expect(element.transport).toBeInstanceOf(WebSocketTransportAdapter);
    expect(transport.dispose).not.toHaveBeenCalled();
  });

  it("isolates two widget histories and unmounts only the removed widget", () => {
    const first = new AGIChatWidgetElement();
    const second = new AGIChatWidgetElement();
    const firstTransport = interactiveTransport();
    const secondTransport = interactiveTransport();
    first.transport = firstTransport;
    second.transport = secondTransport;
    append(first); append(second);
    reply(firstTransport);
    expect(first.shadowRoot?.textContent).toContain("Una película para ti.");
    expect(second.shadowRoot?.textContent).not.toContain("Una película para ti.");
    act(() => { first.remove(); });
    reply(secondTransport);
    expect(second.shadowRoot?.textContent).toContain("Una película para ti.");
    expect(first.shadowRoot?.querySelector(".agichat-widget")).toBeNull();
  });
});
