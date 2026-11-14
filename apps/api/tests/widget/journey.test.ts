// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { journeyAgent } from "./fixtures.js";
import { cleanupWidgets, mountClient, send, text, widgetServer } from "./harness.js";

afterEach(cleanupWidgets);

describe("Public widget connected to HTTP/WebSocket API", () => {
  it.each([
    ["Abre IMDb", "Abre Google Books"],
    ["¿Puedes abrir IMDb?", "¿Podrías abrir Google Books?"]
  ])("recommends, compares and opens references for %s", async (imdbRequest, booksRequest) => {
    const agent = journeyAgent();
    const api = await widgetServer(agent);
    const { host } = await mountClient(api.base);
    const popups = Array.from({ length: 2 }, () => ({ opener: {}, closed: false, close: vi.fn(), location: { replace: vi.fn() } }));
    const open = vi.spyOn(window, "open")
      .mockReturnValueOnce(popups[0] as unknown as Window)
      .mockReturnValueOnce(popups[1] as unknown as Window);
    expect(host.textContent).toContain("Modo de prueba");
    expect(host.querySelector("[aria-label='Créditos de TMDB']")).not.toBeNull();
    await send(host, "Recomienda una película");
    await text(host, "Adaptación de prueba");
    expect(host.querySelector("img[alt='Póster de Adaptación de prueba']")?.getAttribute("src")).toBe("https://image.tmdb.org/t/p/w500/test.jpg");
    expect(open).not.toHaveBeenCalled();
    await send(host, "Compárala con el libro");
    await text(host, "Comparación de prueba");
    expect(agent.respond).toHaveBeenLastCalledWith(expect.objectContaining({ history: [expect.objectContaining({ user: "Recomienda una película" })] }));
    await send(host, imdbRequest);
    await vi.waitFor(() => expect(popups[0]!.location.replace).toHaveBeenCalledWith("https://www.imdb.com/title/tt1234567/"));
    await send(host, booksRequest);
    await vi.waitFor(() => expect(popups[1]!.location.replace).toHaveBeenCalledWith("https://books.google.com/books?id=volume_1"));
    expect(open).toHaveBeenCalledTimes(2);
    expect(popups.every((popup) => popup.opener === null)).toBe(true);
    expect(popups.every((popup) => popup.close.mock.calls.length === 0)).toBe(true);
    expect(api.createSession).toHaveBeenCalledOnce();
  });

  it("does not share conversation state between two widget clients", async () => {
    const agent = journeyAgent();
    const api = await widgetServer(agent);
    const a = await mountClient(api.base);
    const b = await mountClient(api.base);
    await send(a.host, "Recomienda una película");
    await text(a.host, "Adaptación de prueba");
    expect(b.host.textContent).not.toContain("Adaptación de prueba");
    await send(b.host, "Otra conversación");
    await text(b.host, "Adaptación de prueba");
    expect(agent.respond).toHaveBeenLastCalledWith(expect.objectContaining({ content: "Otra conversación", history: [] }));
    expect(api.createSession).toHaveBeenCalledTimes(2);
    a.unmount(); a.transport.dispose();
    await send(b.host, "Compárala con el libro");
    await text(b.host, "Comparación de prueba");
    expect(a.host.childElementCount).toBe(0);
  });
});
