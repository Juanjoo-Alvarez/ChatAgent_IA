import { describe, afterEach, expect, it, vi } from "vitest";
import { cleanupTransports, REQUEST, OTHER, reply, harness, recoveryHarness } from "./helpers/transportHarness";

afterEach(cleanupTransports);

describe("WebSocket messaging", () => {
  it("waits for a correlated response and converts rich content and timestamps", async () => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const resolved = vi.fn();
    const sent = adapter.sendMessage("  Recomiéndame drama  ").then(resolved);
    await Promise.resolve();
    expect(socket.sent.at(-1)).toEqual({ version: 1, type: "user-message", requestId: REQUEST, content: "Recomiéndame drama" });
    expect(resolved).not.toHaveBeenCalled();
    socket.receive({ version: 1, type: "agent-typing", requestId: REQUEST, isTyping: true });
    expect(events).toContainEqual({ type: "agent-typing", isTyping: true });
    socket.receive({ ...reply, requestId: OTHER });
    socket.receive(reply);
    socket.receive(reply);
    await sent;
    const messages = events.filter((event) => event.type === "agent-message");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ message: {
      timestamp: new Date(reply.message.timestamp), cards: [{ id: "1", title: "Película", subtitle: "2020", image: { url: reply.movies[0]!.poster, alt: "Póster de Película" } }], references: reply.references
    } });
  });

  it("keeps absent images and years and emits structured actions only once", async () => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Abre IMDb");
    await Promise.resolve();
    const action = { type: "open-reference", reference: reply.references[0] };
    const response = { ...reply, movies: [{ ...reply.movies[0], year: null, poster: null }], actions: [action] };
    socket.receive(response);
    socket.receive(response);
    await sent;
    expect(events.filter((event) => event.type === "action")).toEqual([{ type: "action", requestId: REQUEST, action }]);
    expect(events.find((event) => event.type === "agent-message")).toMatchObject({ message: { cards: [{ subtitle: null, image: null }] } });
  });

  it.each(["", "   ", "a".repeat(4001)])("rejects invalid input without sending it", async (content) => {
    const { adapter, authenticate } = harness();
    const socket = await authenticate();
    await expect(adapter.sendMessage(content)).rejects.toMatchObject({ code: "invalid_frame" });
    expect(socket.sent).toHaveLength(1);
  });

  it("rejects concurrent sends even while the connection is starting", async () => {
    const { adapter, authenticate } = harness();
    const first = adapter.sendMessage("Hola");
    await expect(adapter.sendMessage("Otra petición")).rejects.toMatchObject({ code: "busy" });
    const socket = await authenticate();
    await Promise.resolve();
    socket.receive(reply);
    await first;
  });

  it("propagates request errors, ignores unrelated errors and allows the next turn", async () => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "busy", message: "Intenta nuevamente." });
    await Promise.resolve();
    const error = { version: 1, type: "error", code: "busy", message: "Intenta nuevamente.", retryable: true };
    socket.receive({ ...error, requestId: OTHER });
    socket.receive({ ...error, requestId: REQUEST });
    await rejected;
    const next = adapter.sendMessage("Otra petición");
    await Promise.resolve();
    socket.receive(reply);
    await next;
    expect(events).toContainEqual({ type: "agent-typing", isTyping: false });
  });

  it("handles socket send failures without leaving pending promises", async () => {
    const { adapter, authenticate } = harness();
    const socket = await authenticate();
    socket.send.mockImplementation(() => { throw new Error("offline"); });
    await expect(adapter.sendMessage("Hola")).rejects.toMatchObject({ code: "connection_failed" });
  });

  it("deduplicates replayed messages and actions across later requests", async () => {
    const { adapter, authenticate, events } = recoveryHarness();
    const socket = await authenticate();
    for (let index = 0; index < 2; index += 1) {
      const sent = adapter.sendMessage("Hola");
      await Promise.resolve();
      socket.receive({ ...reply, actions: [{ type: "open-reference", reference: reply.references[0] }] });
      await sent;
    }
    expect(events.filter((event) => event.type === "agent-message")).toHaveLength(1);
    expect(events.filter((event) => event.type === "action")).toHaveLength(1);
  });

  it("accepts conversations longer than the server replay window", async () => {
    const { adapter, authenticate, events } = recoveryHarness();
    const socket = await authenticate();
    for (let index = 0; index < 21; index += 1) {
      const sent = adapter.sendMessage("Hola");
      await Promise.resolve();
      const id = `${String(index).padStart(8, "0")}-406e-4bbf-bf62-37349f9988db`;
      socket.receive({ ...reply, message: { ...reply.message, id } });
      await sent;
    }
    expect(events.filter((event) => event.type === "agent-message")).toHaveLength(21);
  });
});
