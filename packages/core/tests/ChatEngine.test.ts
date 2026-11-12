import { describe, expect, it, vi } from "vitest";

import { ChatEngine, type ChatEngineState } from "../src/ChatEngine";
import type { Message } from "../src/domain/Message";
import { Session } from "../src/domain/Session";
import { FakeTransportAdapter } from "./fakes/FakeTransportAdapter";

const NOW = new Date("2026-08-25T10:00:00.000Z");

const createHarness = () => {
  const transport = new FakeTransportAdapter();
  const session = new Session({
    id: "session-1",
    metadata: { tenant: "acme" }
  });
  let sequence = 0;
  const engine = new ChatEngine(session, transport, {
    now: () => NOW,
    createId: () => `user-${++sequence}`
  });

  return { engine, session, transport };
};

describe("ChatEngine", () => {
  it("publishes connection state, capabilities and asynchronous errors", () => {
    const { engine, transport } = createHarness();
    expect(engine.getState()).toMatchObject({ connectionStatus: "idle", capabilityNotice: null, mode: null, transportError: null });
    transport.emit({ type: "connection-state", status: "connecting" });
    transport.emit({ type: "session-ready", notice: "Puedo comparar películas y libros.", mode: "fixture" });
    transport.emit({ type: "connection-state", status: "connected" });
    expect(engine.getState()).toMatchObject({ connectionStatus: "connected", capabilityNotice: "Puedo comparar películas y libros.", mode: "fixture" });
    transport.emit({ type: "agent-typing", isTyping: true });
    const error = new Error("Sin conexión");
    transport.emit({ type: "transport-error", error });
    expect(engine.getState()).toMatchObject({ transportError: error, isAgentTyping: false });
    transport.emit({ type: "session-ready", notice: "Reconectado", mode: "fixture" });
    expect(engine.getState().transportError).toBeNull();
    transport.emit({ type: "agent-typing", isTyping: true });
    transport.emit({ type: "connection-state", status: "disconnected" });
    expect(engine.getState().isAgentTyping).toBe(false);
  });

  it("keeps rich responses and publishes actions separately from message text", () => {
    const { engine, transport } = createHarness();
    const handler = vi.fn();
    const unsubscribe = engine.onAction(handler);
    const reference = { provider: "imdb", id: "tt1234567" };
    const card = { id: "1", title: "Película", subtitle: null, image: null };
    transport.emit({ type: "agent-message", message: { id: "agent-rich", content: "Recomendación", timestamp: NOW, cards: [card], references: [reference] } });
    const event = { type: "action" as const, requestId: "request-1", action: { type: "open-reference" as const, reference } };
    transport.emit(event);
    expect(engine.getMessages()[0]).toMatchObject({ cards: [card], references: [reference] });
    expect(handler).toHaveBeenCalledWith(event);
    unsubscribe();
    transport.emit(event);
    expect(handler).toHaveBeenCalledTimes(1);
    engine.dispose();
    expect(() => engine.onAction(handler)).toThrow("ChatEngine has been disposed");
  });

  it("publishes sending immediately and sent after a successful send", async () => {
    const { engine, transport } = createHarness();
    const deferred = transport.deferNextSend();
    const snapshots: Array<readonly Message[]> = [];
    engine.onMessagesChange((messages) => snapshots.push(messages));

    const sending = engine.sendUserMessage("Hola **AGIChat**");

    expect(transport.sentContents).toEqual(["Hola **AGIChat**"]);
    expect(engine.getMessages()[0]).toMatchObject({
      id: "user-1",
      role: "user",
      content: "Hola **AGIChat**",
      status: "sending"
    });
    expect(snapshots.map((snapshot) => snapshot[0]?.status)).toEqual([
      undefined,
      "sending"
    ]);

    deferred.resolve();
    await expect(sending).resolves.toMatchObject({ status: "sent" });
    expect(engine.getMessages()[0]?.status).toBe("sent");
    expect(snapshots.at(-1)?.[0]?.status).toBe("sent");
  });

  it("marks the message as error and propagates a transport failure", async () => {
    const { engine, transport } = createHarness();
    const transportError = new Error("transport unavailable");
    transport.failNextSend(transportError);

    await expect(engine.sendUserMessage("Hola")).rejects.toBe(transportError);
    expect(engine.getMessages()[0]?.status).toBe("error");
  });

  it("adds controlled agent responses and clears the typing state", () => {
    const { engine, transport } = createHarness();
    const states: ChatEngineState[] = [];
    engine.onStateChange((state) => states.push(state));

    transport.emit({ type: "agent-typing", isTyping: true });
    expect(engine.getState().isAgentTyping).toBe(true);

    transport.emit({ type: "agent-typing", isTyping: true });
    expect(states).toHaveLength(2);

    transport.emit({
      type: "agent-message",
      message: {
        id: "agent-1",
        content: "¡Hola! ¿Cómo te ayudo?",
        timestamp: new Date("2026-08-25T10:00:01.000Z")
      }
    });

    expect(engine.getState()).toMatchObject({
      session: { id: "session-1" },
      isAgentTyping: false
    });
    expect(engine.getMessages()[0]).toMatchObject({
      id: "agent-1",
      role: "agent",
      status: "sent"
    });
    expect(states.at(-1)?.isAgentTyping).toBe(false);
  });

  it("supports unsubscribing message and state listeners", async () => {
    const { engine } = createHarness();
    const messagesHandler = vi.fn();
    const stateHandler = vi.fn();
    const unsubscribeMessages = engine.onMessagesChange(messagesHandler);
    const unsubscribeState = engine.onStateChange(stateHandler);

    unsubscribeMessages();
    unsubscribeState();
    await engine.sendUserMessage("Hola");

    expect(messagesHandler).toHaveBeenCalledTimes(1);
    expect(stateHandler).toHaveBeenCalledTimes(1);
  });

  it("disposes its transport subscription and rejects further use", async () => {
    const { engine, transport } = createHarness();
    const listener = vi.fn();
    engine.onStateChange(listener);

    expect(transport.subscriberCount).toBe(1);
    engine.dispose();
    engine.dispose();
    expect(transport.subscriberCount).toBe(0);

    transport.emit({ type: "agent-typing", isTyping: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => engine.onMessagesChange(vi.fn())).toThrow(
      "ChatEngine has been disposed"
    );
    expect(() => engine.onStateChange(vi.fn())).toThrow(
      "ChatEngine has been disposed"
    );
    await expect(engine.sendUserMessage("Hola")).rejects.toThrow(
      "ChatEngine has been disposed"
    );
  });
});
