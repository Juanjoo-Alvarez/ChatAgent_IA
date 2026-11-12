import { describe, afterEach, expect, it, vi } from "vitest";
import { cleanupTransports, SESSION, REQUEST, credentials, ready, reply, harness, recoveryHarness, acceptSocket } from "./helpers/transportHarness";

afterEach(cleanupTransports);

describe("WebSocket cancellation", () => {
  it("cancels timed out turns and ignores late responses", async () => {
    const { adapter, authenticate, events } = harness({ responseTimeoutMs: 100 });
    const socket = await authenticate();
    vi.useFakeTimers();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(socket.sent.at(-1)).toEqual({ version: 1, type: "cancel", requestId: REQUEST });
    socket.receive(reply);
    expect(events.some((event) => event.type === "agent-message")).toBe(false);
  });

  it("does not send cancellation before reauthentication finishes", async () => {
    const { adapter, authenticate, sockets } = recoveryHarness({ responseTimeoutMs: 150 });
    const first = await authenticate();
    vi.useFakeTimers();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "timeout" });
    await Promise.resolve();
    first.dispatchEvent(new Event("close"));
    await vi.advanceTimersByTimeAsync(100);
    const second = sockets[1]!;
    second.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    second.receive(ready);
    expect(second.sent).toEqual([{ version: 1, type: "authenticate", sessionId: SESSION, token: credentials.token }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a turn explicitly and ignores its delayed action", async () => {
    const { adapter, authenticate, events } = recoveryHarness();
    const socket = await authenticate();
    vi.useFakeTimers();
    adapter.cancel();
    const sent = adapter.sendMessage("Abre IMDb");
    const rejected = expect(sent).rejects.toMatchObject({ code: "cancelled" });
    await Promise.resolve();
    adapter.cancel();
    adapter.cancel();
    await rejected;
    socket.receive({ ...reply, actions: [{ type: "open-reference", reference: reply.references[0] }] });
    expect(socket.sent.filter((frame) => (frame as { type: string }).type === "cancel")).toHaveLength(1);
    expect(events.some((event) => event.type === "action" || event.type === "agent-message")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not replay a cancelled turn after reconnecting", async () => {
    const { adapter, authenticate, sockets } = recoveryHarness();
    const first = await authenticate();
    vi.useFakeTimers();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "cancelled" });
    await Promise.resolve();
    first.dispatchEvent(new Event("close"));
    adapter.cancel();
    await rejected;
    await vi.advanceTimersByTimeAsync(100);
    const second = sockets[1]!;
    acceptSocket(second);
    expect(second.sent).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a turn while authentication is still pending", async () => {
    const { adapter, sockets } = recoveryHarness();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "cancelled" });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    vi.useFakeTimers();
    adapter.cancel();
    await rejected;
    acceptSocket(sockets[0]!);
    expect(sockets[0]!.sent).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels before an authenticated turn starts sending", async () => {
    const { adapter, authenticate } = recoveryHarness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Hola");
    adapter.cancel();
    await expect(sent).rejects.toMatchObject({ code: "cancelled" });
    expect(socket.sent).toHaveLength(1);
  });

  it("does not close a healthy connection when cancelling a completed turn", async () => {
    const { adapter, authenticate } = recoveryHarness();
    const socket = await authenticate();
    const sent = adapter.sendMessage("Hola");
    await Promise.resolve();
    socket.receive(reply);
    adapter.cancel();
    await sent;
    expect(socket.close).not.toHaveBeenCalled();
  });
});
