import { describe, afterEach, expect, it, vi } from "vitest";
import { cleanupTransports, REQUEST, reply, recoveryHarness, acceptSocket } from "./helpers/transportHarness";

afterEach(cleanupTransports);

describe("WebSocket recovery", () => {
  it("reconnects an idle widget with the same credentials and no duplicated listeners", async () => {
    const { adapter, authenticate, sockets, fetch, events } = recoveryHarness();
    const first = await authenticate();
    const remove = vi.spyOn(first, "removeEventListener");
    vi.useFakeTimers();
    first.dispatchEvent(new Event("close"));
    expect(remove).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(99);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const second = sockets[1]!;
    const add = vi.spyOn(second, "addEventListener");
    acceptSocket(second);
    expect(second.sent).toEqual(first.sent);
    expect(fetch).toHaveBeenCalledOnce();
    await adapter.connect();
    expect(add).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ type: "session-ready" });
    expect(events.some((event) => event.type === "transport-error")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("replays only the uncertain request with its original ID and content", async () => {
    const { adapter, authenticate, sockets, events, fetch } = recoveryHarness();
    const first = await authenticate();
    vi.useFakeTimers();
    const settled = vi.fn();
    const sent = adapter.sendMessage("Recomiéndame una película").then(settled);
    await Promise.resolve();
    const frame = first.sent.at(-1);
    first.dispatchEvent(new Event("error"));
    first.dispatchEvent(new Event("close"));
    await vi.advanceTimersByTimeAsync(100);
    const second = sockets[1]!;
    acceptSocket(second);
    expect(second.sent.at(-1)).toEqual(frame);
    expect(settled).not.toHaveBeenCalled();
    await expect(adapter.sendMessage("Otra petición")).rejects.toMatchObject({ code: "busy" });
    first.receive(reply);
    const action = { type: "open-reference", reference: reply.references[0] };
    second.receive({ ...reply, actions: [action] });
    second.receive({ ...reply, actions: [action] });
    await sent;
    expect(fetch).toHaveBeenCalledOnce();
    expect(events.filter((event) => event.type === "agent-message")).toHaveLength(1);
    expect(events.filter((event) => event.type === "action")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses exponential delays with a cap and stops after the configured retries", async () => {
    const { adapter, authenticate, sockets, events } = recoveryHarness();
    const first = await authenticate();
    vi.useFakeTimers();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "connection_failed" });
    await Promise.resolve();
    first.dispatchEvent(new Event("close"));
    for (const [index, delay] of [100, 200, 250].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(sockets).toHaveLength(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(index + 2);
      sockets[index + 1]!.dispatchEvent(new Event("close"));
    }
    await rejected;
    await vi.advanceTimersByTimeAsync(5000);
    expect(sockets).toHaveLength(4);
    expect(events.filter((event) => event.type === "transport-error")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds retries even when connections authenticate but keep dropping during a turn", async () => {
    const { adapter, authenticate, sockets } = recoveryHarness({ maxReconnectAttempts: 2 });
    const first = await authenticate();
    vi.useFakeTimers();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "connection_failed" });
    await Promise.resolve();
    first.dispatchEvent(new Event("close"));
    for (const [index, delay] of [100, 200].entries()) {
      await vi.advanceTimersByTimeAsync(delay);
      acceptSocket(sockets[index + 1]!);
      sockets[index + 1]!.dispatchEvent(new Event("close"));
    }
    await rejected;
    expect(sockets).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a busy lease only while replaying an uncertain request", async () => {
    const { adapter, authenticate, sockets } = recoveryHarness();
    const first = await authenticate();
    vi.useFakeTimers();
    const sent = adapter.sendMessage("Hola");
    await Promise.resolve();
    first.dispatchEvent(new Event("close"));
    await vi.advanceTimersByTimeAsync(100);
    const second = sockets[1]!;
    acceptSocket(second);
    second.receive({ version: 1, type: "error", requestId: REQUEST, code: "busy", message: "Intenta nuevamente.", retryable: true });
    await vi.advanceTimersByTimeAsync(200);
    const third = sockets[2]!;
    acceptSocket(third);
    expect(third.sent.at(-1)).toEqual(first.sent.at(-1));
    third.receive({ ...reply, actions: [] });
    await sent;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not extend the original response deadline when replaying", async () => {
    const { adapter, authenticate, sockets, events } = recoveryHarness({ responseTimeoutMs: 150 });
    const first = await authenticate();
    vi.useFakeTimers();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "timeout" });
    await Promise.resolve();
    first.dispatchEvent(new Event("close"));
    await vi.advanceTimersByTimeAsync(100);
    const second = sockets[1]!;
    acceptSocket(second);
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(second.sent.at(-1)).toEqual({ version: 1, type: "cancel", requestId: REQUEST });
    second.receive(reply);
    expect(events.some((event) => event.type === "agent-message")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows an explicit connection attempt after exhausting transient retries", async () => {
    const { adapter, authenticate, sockets } = recoveryHarness({ maxReconnectAttempts: 1 });
    const first = await authenticate();
    vi.useFakeTimers();
    first.dispatchEvent(new Event("close"));
    await vi.advanceTimersByTimeAsync(100);
    sockets[1]!.dispatchEvent(new Event("close"));
    expect(vi.getTimerCount()).toBe(0);
    const connecting = adapter.connect();
    expect(sockets).toHaveLength(3);
    acceptSocket(sockets[2]!);
    await connecting;
    expect(vi.getTimerCount()).toBe(0);
  });
});
