import { describe, expect, it, vi } from "vitest";

import {
  WebSocketTransportAdapter,
  WebSocketTransportNotImplementedError
} from "../src";

describe("WebSocketTransportAdapter", () => {
  it("accepts secure WebSocket URLs and preserves protocols", () => {
    const protocols = ["agichat.v1"];
    const adapter = new WebSocketTransportAdapter({
      url: "wss://example.test/chat",
      protocols
    });

    expect(adapter.url.href).toBe("wss://example.test/chat");
    expect(adapter.protocols).toBe(protocols);
  });

  it("accepts an URL instance using the ws protocol", () => {
    const adapter = new WebSocketTransportAdapter({
      url: new URL("ws://localhost:8080")
    });

    expect(adapter.url.protocol).toBe("ws:");
    expect(adapter.protocols).toBeUndefined();
  });

  it("rejects non-WebSocket protocols", () => {
    expect(
      () => new WebSocketTransportAdapter({ url: "https://example.test" })
    ).toThrow(new TypeError("WebSocket URL must use the ws: or wss: protocol"));
  });

  it("reports that sending is reserved for Project 2", async () => {
    const adapter = new WebSocketTransportAdapter({
      url: "wss://example.test/chat"
    });

    await expect(adapter.sendMessage("Hola")).rejects.toBeInstanceOf(
      WebSocketTransportNotImplementedError
    );
  });

  it("allows subscriptions to be removed and disposed safely", () => {
    const adapter = new WebSocketTransportAdapter({
      url: "wss://example.test/chat"
    });
    const unsubscribe = adapter.subscribe(vi.fn());

    expect(unsubscribe).toBeTypeOf("function");
    expect(() => unsubscribe()).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();
    expect(() => adapter.dispose()).not.toThrow();
  });
});
