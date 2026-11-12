import { describe, afterEach, expect, it, vi } from "vitest";
import { cleanupTransports, REQUEST, reply, harness, recoveryHarness } from "./helpers/transportHarness";

afterEach(cleanupTransports);

describe("WebSocket security", () => {
  it.each(["unauthorized", "session_expired"])("disconnects on %s", async (code) => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code });
    await Promise.resolve();
    socket.receive({ version: 1, type: "error", requestId: REQUEST, code, message: "Sesión inválida.", retryable: false });
    await rejected;
    expect(socket.close).toHaveBeenCalledOnce();
    expect(events).toContainEqual({ type: "connection-state", status: "disconnected" });
  });

  it.each(["not json", JSON.stringify({ version: 2 }), new Uint8Array([1]), "a".repeat(32769)])("rejects malformed, binary or oversized frames", async (data) => {
    const { adapter, authenticate } = harness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "invalid_response" });
    await Promise.resolve();
    socket.dispatchEvent(new MessageEvent("message", { data }));
    await rejected;
  });

  it("rejects a poster outside the allowlist and arbitrary URL actions", async () => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "invalid_response" });
    await Promise.resolve();
    socket.receive({ ...reply, movies: [{ ...reply.movies[0], poster: "https://evil.invalid/tracker" }], actions: [{ type: "open-reference", url: "https://evil.invalid" }] });
    await rejected;
    expect(events.some((event) => event.type === "action" || event.type === "agent-message")).toBe(false);
  });

  it.each(["unauthorized", "session_expired"])("never retries or silently replaces a %s session", async (code) => {
    const { adapter, authenticate, sockets, fetch } = recoveryHarness();
    const first = await authenticate();
    vi.useFakeTimers();
    first.receive({ version: 1, type: "error", code, message: "Sesión inválida.", retryable: true });
    await expect(adapter.connect()).rejects.toMatchObject({ code });
    await expect(adapter.sendMessage("Hola")).rejects.toMatchObject({ code });
    await vi.advanceTimersByTimeAsync(10000);
    expect(sockets).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops on invalid frames without retrying a protocol violation", async () => {
    const { adapter, authenticate, sockets } = recoveryHarness();
    const first = await authenticate();
    vi.useFakeTimers();
    first.receive({ version: 999 });
    await expect(adapter.connect()).rejects.toMatchObject({ code: "invalid_response" });
    await vi.advanceTimersByTimeAsync(10000);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
