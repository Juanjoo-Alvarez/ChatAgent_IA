import { describe, afterEach, expect, it } from "vitest";
import { WebSocketTransportAdapter } from "../src";
import { cleanupTransports, recoveryHarness } from "./helpers/transportHarness";

afterEach(cleanupTransports);

describe("WebSocket configuration", () => {
  it.each(["https://example.test/chat", "wss://example.test/other", "ws://user:pass@example.test/chat", "wss://example.test/chat?token=secret", "wss://example.test/chat#secret"])("rejects unsafe endpoint %s", (url) => {
    expect(() => new WebSocketTransportAdapter({ url })).toThrow(TypeError);
  });

  it.each([0, -1, NaN, 1.5])("rejects invalid timeouts %s", (timeout) => {
    expect(() => new WebSocketTransportAdapter({ url: "ws://example.test/chat", connectTimeoutMs: timeout })).toThrow(TypeError);
    expect(() => new WebSocketTransportAdapter({ url: "ws://example.test/chat", responseTimeoutMs: timeout })).toThrow(TypeError);
  });

  it.each([-1, 1.5, 11, NaN])("rejects invalid retry count %s", (maxReconnectAttempts) => {
    expect(() => new WebSocketTransportAdapter({ url: "ws://localhost/chat", maxReconnectAttempts })).toThrow(TypeError);
  });

  it.each([0, -1, 1.5, 2147483648])("rejects invalid retry delay %s", (delay) => {
    expect(() => new WebSocketTransportAdapter({ url: "ws://localhost/chat", reconnectDelayMs: delay })).toThrow(TypeError);
    expect(() => new WebSocketTransportAdapter({ url: "ws://localhost/chat", maxReconnectDelayMs: delay })).toThrow(TypeError);
  });

  it("rejects a maximum delay smaller than its initial delay", () => {
    expect(() => recoveryHarness({ reconnectDelayMs: 200, maxReconnectDelayMs: 100 })).toThrow(TypeError);
  });
});
