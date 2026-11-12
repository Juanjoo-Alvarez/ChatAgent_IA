import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChat } from "../../src/hooks/useChat";
import { FakeTransportAdapter } from "../fakes/FakeTransportAdapter";

const reference = { provider: "imdb", id: "tt1234567" };
function harness() {
  const transport = new FakeTransportAdapter();
  const popup = { opener: {}, closed: false, close: vi.fn(), location: { replace: vi.fn() } };
  const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  const hook = renderHook(() => useChat({ transport }));
  act(() => transport.emit({ type: "agent-message", message: { id: "known", content: "Una película", timestamp: new Date(), references: [reference] } }));
  return { transport, popup, open, ...hook };
}
afterEach(() => vi.restoreAllMocks());

describe("useChat browser integration", () => {
  it("reserves synchronously and navigates on a structured action", async () => {
    const { result, transport, open, popup } = harness();
    const deferred = transport.deferNextSend();
    let sent!: Promise<void>;
    act(() => { sent = result.current.sendMessage("Abre IMDb"); });
    expect(open).toHaveBeenCalledOnce();
    act(() => transport.emit({ type: "action", requestId: "r1", action: { type: "open-reference", reference } }));
    await act(async () => { deferred.resolve(); await sent; });
    expect(popup.location.replace).toHaveBeenCalledWith("https://www.imdb.com/title/tt1234567/");
    expect(popup.close).not.toHaveBeenCalled();
  });
  it("closes the reservation on failure or when there is no action", async () => {
    const { result, transport, popup } = harness();
    transport.failNextSend(new Error("unavailable"));
    await act(() => result.current.sendMessage("Abre IMDb"));
    expect(popup.close).toHaveBeenCalledOnce();
    await act(() => result.current.sendMessage("Abre IMDb"));
    expect(popup.close).toHaveBeenCalledTimes(2);
  });
  it("reports popup blocking before sending the request", async () => {
    const { result, open, transport } = harness();
    open.mockReturnValue(null);
    await act(() => result.current.sendMessage("Abre IMDb"));
    expect(result.current.error?.message).toContain("Permite las ventanas emergentes");
    expect(transport.sentContents).toEqual([]);
  });
  it("closes the reserved tab and ignores a pending result after unmount", async () => {
    const { result, unmount, transport, popup } = harness();
    const deferred = transport.deferNextSend();
    let sent!: Promise<void>;
    act(() => { sent = result.current.sendMessage("Abre IMDb"); });
    unmount();
    expect(popup.close).toHaveBeenCalledOnce();
    await act(async () => { deferred.reject(new Error("cancelled")); await sent; });
    expect(transport.subscriberCount).toBe(0);
  });
  it("ignores double sends during a pending turn", async () => {
    const { result, transport, open } = harness();
    const deferred = transport.deferNextSend();
    let sent!: Promise<void>;
    act(() => { sent = result.current.sendMessage("Abre IMDb"); });
    await act(() => result.current.sendMessage("Abre IMDb"));
    expect(open).toHaveBeenCalledOnce();
    expect(transport.sentContents).toHaveLength(1);
    await act(async () => { deferred.resolve(); await sent; });
  });
  it("exposes connection state and capability notices", () => {
    const { result, transport } = harness();
    act(() => {
      transport.emit({ type: "connection-state", status: "connected" });
      transport.emit({ type: "session-ready", notice: "Puedo comparar películas y libros.", mode: "fixture" });
    });
    expect(result.current.connectionStatus).toBe("connected");
    expect(result.current.capabilityNotice).toContain("comparar");
    expect(result.current.mode).toBe("fixture");
    const error = new Error("Sin conexión");
    act(() => transport.emit({ type: "transport-error", error }));
    expect(result.current.error).toBe(error);
  });
  it("reports a navigation failure without blocking completion of the turn", async () => {
    const { result, transport, popup } = harness();
    const deferred = transport.deferNextSend();
    popup.location.replace.mockImplementation(() => { throw new Error("denied"); });
    let sent!: Promise<void>;
    act(() => { sent = result.current.sendMessage("Abre IMDb"); });
    act(() => transport.emit({ type: "action", requestId: "r1", action: { type: "open-reference", reference } }));
    await act(async () => { deferred.resolve(); await sent; });
    expect(result.current.error?.message).toContain("No se pudo abrir");
    expect(result.current.isSending).toBe(false);
  });
});
