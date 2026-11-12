import { describe, afterEach, expect, it, vi } from "vitest";
import { CAPABILITY_NOTICE } from "@agichat/protocol";
import { WebSocketTransportError } from "../src";
import { cleanupTransports, credentials, reply, harness, recoveryHarness, acceptSocket } from "./helpers/transportHarness";

afterEach(cleanupTransports);

describe("WebSocket lifecycle", () => {
  it("rejects pending requests on disconnect and removes all socket listeners", async () => {
    const { adapter, authenticate, events } = harness();
    const socket = await authenticate();
    const remove = vi.spyOn(socket, "removeEventListener");
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "connection_failed" });
    await Promise.resolve();
    socket.dispatchEvent(new Event("close"));
    await rejected;
    expect(remove).toHaveBeenCalledTimes(4);
    const count = events.length;
    socket.receive(reply);
    socket.dispatchEvent(new Event("error"));
    expect(events).toHaveLength(count);
  });

  it("cancels the last subscription during connection and rejects use after disposal", async () => {
    const { adapter, sockets, events, unsubscribe } = harness();
    const rejected = expect(adapter.connect()).rejects.toMatchObject({ code: "cancelled" });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    unsubscribe();
    unsubscribe();
    const count = events.length;
    adapter.dispose();
    adapter.dispose();
    await rejected;
    expect(sockets[0]!.close).toHaveBeenCalledOnce();
    expect(events).toHaveLength(count);
    await expect(adapter.sendMessage("Hola")).rejects.toMatchObject({ code: "disposed" });
    expect(() => adapter.subscribe(vi.fn())).toThrow(WebSocketTransportError);
  });

  it("preserves the session error for a widget that subscribes again", async () => {
    const { adapter, authenticate, unsubscribe } = recoveryHarness();
    const socket = await authenticate();
    socket.receive({ version: 1, type: "error", code: "session_expired", message: "La sesión expiró.", retryable: false });
    unsubscribe();
    const listener = vi.fn();
    adapter.subscribe(listener);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "transport-error", error: expect.objectContaining({ code: "session_expired" }) }));
  });

  it("stops all recovery timers and rejects the pending turn on dispose", async () => {
    const { adapter, authenticate, sockets } = recoveryHarness();
    const first = await authenticate();
    vi.useFakeTimers();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "disposed" });
    await Promise.resolve();
    first.dispatchEvent(new Event("close"));
    adapter.dispose();
    adapter.dispose();
    await rejected;
    await vi.advanceTimersByTimeAsync(10000);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes only when the last subscriber leaves and supports subscribing again", async () => {
    const { adapter, authenticate, sockets, unsubscribe, fetch } = recoveryHarness();
    const first = await authenticate();
    const unsubscribeOther = adapter.subscribe(vi.fn());
    unsubscribe();
    expect(first.close).not.toHaveBeenCalled();
    unsubscribeOther();
    unsubscribeOther();
    expect(first.close).toHaveBeenCalledOnce();
    const listener = vi.fn();
    adapter.subscribe(listener);
    expect(sockets).toHaveLength(2);
    acceptSocket(sockets[1]!);
    await adapter.connect();
    expect(fetch).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ type: "session-ready", notice: CAPABILITY_NOTICE, mode: "fixture" });
  });

  it("cleans up recovery and pending work when its last subscriber leaves", async () => {
    const { adapter, authenticate, sockets, unsubscribe } = recoveryHarness();
    const first = await authenticate();
    vi.useFakeTimers();
    const sent = adapter.sendMessage("Hola");
    const rejected = expect(sent).rejects.toMatchObject({ code: "cancelled" });
    await Promise.resolve();
    first.dispatchEvent(new Event("close"));
    unsubscribe();
    await rejected;
    await vi.advanceTimersByTimeAsync(10000);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores session responses that arrive after disposal", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise((accept) => { resolve = accept; }));
    const { adapter, sockets } = recoveryHarness({ fetch });
    const rejected = expect(adapter.connect()).rejects.toMatchObject({ code: "disposed" });
    adapter.dispose();
    await rejected;
    resolve(new Response(JSON.stringify(credentials)));
    await vi.waitFor(() => expect(sockets).toHaveLength(0));
  });

  it("isolates recovery and disposal between widget instances", async () => {
    const first = recoveryHarness();
    const second = recoveryHarness();
    const firstSocket = await first.authenticate();
    const secondSocket = await second.authenticate();
    vi.useFakeTimers();
    firstSocket.dispatchEvent(new Event("close"));
    first.adapter.dispose();
    const sent = second.adapter.sendMessage("Hola");
    await Promise.resolve();
    secondSocket.receive(reply);
    await sent;
    await vi.advanceTimersByTimeAsync(1000);
    expect(first.sockets).toHaveLength(1);
    expect(second.sockets).toHaveLength(1);
    expect(secondSocket.close).not.toHaveBeenCalled();
    expect(second.events.filter((event) => event.type === "agent-message")).toHaveLength(1);
  });
});
