import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TransportEvent } from "@agichat/core";

import {
  MockTransportAdapter,
  MockTransportDisposedError,
  MockTransportTimeoutError
} from "../src";

describe("MockTransportAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("confirms a send and emits typing followed by a Markdown reply", async () => {
    const timestamp = new Date("2026-01-01T00:00:00.000Z");
    const adapter = new MockTransportAdapter({
      sendDelayMs: 5,
      typingDelayMs: 10,
      replyDelayMs: 20,
      createId: () => "agent-1",
      now: () => timestamp
    });
    const events: TransportEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    const sending = adapter.sendMessage("Hola");
    await vi.advanceTimersByTimeAsync(5);
    await expect(sending).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(10);
    expect(events).toEqual([{ type: "agent-typing", isTyping: true }]);

    await vi.advanceTimersByTimeAsync(20);
    expect(events).toEqual([
      { type: "agent-typing", isTyping: true },
      { type: "agent-typing", isTyping: false },
      {
        type: "agent-message",
        message: {
          id: "agent-1",
          content: expect.stringContaining("**respuesta simulada**"),
          timestamp
        }
      }
    ]);
  });

  it("returns 42 for the question represented in the wireframe", async () => {
    const adapter = new MockTransportAdapter({
      typingDelayMs: 0,
      replyDelayMs: 0,
      createId: () => "agent-42"
    });
    const events: TransportEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    const sending = adapter.sendMessage(
      "What is the answer to life, the universe and everything?"
    );
    await vi.runAllTimersAsync();
    await sending;

    expect(events[2]).toMatchObject({
      type: "agent-message",
      message: { content: "42" }
    });
  });

  it("rejects with the configured transport error", async () => {
    const error = new Error("API unavailable");
    const adapter = new MockTransportAdapter({
      mode: "error",
      sendDelayMs: 25,
      error
    });

    const sending = adapter.sendMessage("Hola");
    const assertion = expect(sending).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
  });

  it("rejects with a typed timeout error after the configured limit", async () => {
    const adapter = new MockTransportAdapter({
      mode: "timeout",
      timeoutMs: 100
    });

    const sending = adapter.sendMessage("Hola");
    const assertion = expect(sending).rejects.toEqual(
      new MockTransportTimeoutError(100)
    );
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
  });

  it("stops notifying a subscriber after it unsubscribes", async () => {
    const adapter = new MockTransportAdapter({
      typingDelayMs: 1,
      replyDelayMs: 1
    });
    const handler = vi.fn();
    const unsubscribe = adapter.subscribe(handler);
    unsubscribe();

    const sending = adapter.sendMessage("Hola");
    await vi.runAllTimersAsync();
    await sending;

    expect(handler).not.toHaveBeenCalled();
  });

  it("cancels timers and pending sends when disposed", async () => {
    const adapter = new MockTransportAdapter({ sendDelayMs: 50 });
    const sending = adapter.sendMessage("Hola");
    const assertion = expect(sending).rejects.toBeInstanceOf(
      MockTransportDisposedError
    );

    adapter.dispose();
    adapter.dispose();

    await assertion;
    await expect(adapter.sendMessage("Otro mensaje")).rejects.toBeInstanceOf(
      MockTransportDisposedError
    );
    expect(() => adapter.subscribe(vi.fn())).toThrow(MockTransportDisposedError);
  });

  it("validates all configured delays", () => {
    expect(() => new MockTransportAdapter({ sendDelayMs: -1 })).toThrow(
      RangeError
    );
    expect(
      () => new MockTransportAdapter({ typingDelayMs: Number.NaN })
    ).toThrow(RangeError);
    expect(
      () => new MockTransportAdapter({ replyDelayMs: Number.POSITIVE_INFINITY })
    ).toThrow(RangeError);
    expect(() => new MockTransportAdapter({ timeoutMs: -1 })).toThrow(
      RangeError
    );
  });
});
