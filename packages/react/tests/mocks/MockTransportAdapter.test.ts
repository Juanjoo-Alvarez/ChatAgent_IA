import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TransportEvent } from "@agichat/core";

import { MockTransportAdapter } from "../../src/mocks/MockTransportAdapter";

describe("MockTransportAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("simulates agent typing followed by a reply after sending a message", async () => {
    const adapter = new MockTransportAdapter({
      typingDelayMs: 10,
      replyDelayMs: 20,
      createId: () => "agent-1",
      now: () => new Date("2026-01-01T00:00:00.000Z")
    });
    const events: TransportEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    await adapter.sendMessage("Hola");

    await vi.advanceTimersByTimeAsync(10);
    expect(events).toEqual([{ type: "agent-typing", isTyping: true }]);

    await vi.advanceTimersByTimeAsync(20);
    expect(events).toHaveLength(3);
    expect(events[1]).toEqual({ type: "agent-typing", isTyping: false });
    expect(events[2]).toMatchObject({
      type: "agent-message",
      message: { id: "agent-1", content: expect.stringContaining("Hola") }
    });
  });

  it("stops emitting events after unsubscribing", async () => {
    const adapter = new MockTransportAdapter({ typingDelayMs: 5, replyDelayMs: 5 });
    const handler = vi.fn();
    const unsubscribe = adapter.subscribe(handler);
    unsubscribe();

    await adapter.sendMessage("Hola");
    await vi.advanceTimersByTimeAsync(20);

    expect(handler).not.toHaveBeenCalled();
  });

  it("cancels pending timers when disposed", async () => {
    const adapter = new MockTransportAdapter({ typingDelayMs: 5, replyDelayMs: 5 });
    const handler = vi.fn();
    adapter.subscribe(handler);

    await adapter.sendMessage("Hola");
    adapter.dispose();
    await vi.advanceTimersByTimeAsync(20);

    expect(handler).not.toHaveBeenCalled();
  });
});
