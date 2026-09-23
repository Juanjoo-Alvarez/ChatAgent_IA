import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useChat } from "../../src/hooks/useChat";
import { FakeTransportAdapter } from "../fakes/FakeTransportAdapter";

const NOW = new Date("2026-08-25T10:00:00.000Z");

describe("useChat", () => {
  it("starts with no messages and no agent typing", () => {
    const transport = new FakeTransportAdapter();
    const { result } = renderHook(() =>
      useChat({ transport, sessionId: "session-1" })
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.isAgentTyping).toBe(false);
    expect(result.current.isSending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sends a user message through the transport and reflects it in messages", async () => {
    const transport = new FakeTransportAdapter();
    let sequence = 0;
    const { result } = renderHook(() =>
      useChat({
        transport,
        sessionId: "session-1",
        now: () => NOW,
        createId: () => `user-${++sequence}`
      })
    );

    await act(async () => {
      await result.current.sendMessage("Hola AGIChat");
    });

    expect(transport.sentContents).toEqual(["Hola AGIChat"]);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "Hola AGIChat",
      status: "sent"
    });
    expect(result.current.isSending).toBe(false);
  });

  it("exposes an error when the transport fails to send", async () => {
    const transport = new FakeTransportAdapter();
    const transportError = new Error("transport unavailable");
    transport.failNextSend(transportError);
    const { result } = renderHook(() => useChat({ transport, sessionId: "session-1" }));

    await act(async () => {
      await result.current.sendMessage("Hola");
    });

    expect(result.current.error).toBe(transportError);
    expect(result.current.messages[0]?.status).toBe("error");
    expect(result.current.isSending).toBe(false);
  });

  it("reflects incoming agent messages and typing state from the transport", async () => {
    const transport = new FakeTransportAdapter();
    const { result } = renderHook(() => useChat({ transport, sessionId: "session-1" }));

    act(() => {
      transport.emit({ type: "agent-typing", isTyping: true });
    });
    expect(result.current.isAgentTyping).toBe(true);

    act(() => {
      transport.emit({
        type: "agent-message",
        message: {
          id: "agent-1",
          content: "¡Hola! ¿Cómo te ayudo?",
          timestamp: new Date("2026-08-25T10:00:01.000Z")
        }
      });
    });

    await waitFor(() => {
      expect(result.current.isAgentTyping).toBe(false);
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: "agent",
      content: "¡Hola! ¿Cómo te ayudo?"
    });
  });

  it("disposes the underlying engine's transport subscription on unmount", () => {
    const transport = new FakeTransportAdapter();
    const { unmount } = renderHook(() => useChat({ transport, sessionId: "session-1" }));

    expect(transport.subscriberCount).toBe(1);
    unmount();
    expect(transport.subscriberCount).toBe(0);
  });

  it("ignores a sendMessage call made after the hook has unmounted", async () => {
    const transport = new FakeTransportAdapter();
    const { result, unmount } = renderHook(() =>
      useChat({ transport, sessionId: "session-1" })
    );

    unmount();

    await expect(result.current.sendMessage("Hola")).resolves.toBeUndefined();
    expect(transport.sentContents).toEqual([]);
  });
});
