import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocketTransportAdapter } from "../src/index";

// Ejecutar la demo con la API pública local y sin conexiones externas.
vi.mock("@agichat/embed", () => import("../src/index"));

afterEach(() => {
  act(() => { window.dispatchEvent(new Event("pagehide")); });
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("shows TMDB attribution on demo startup and after starting a new conversation, without messages", async () => {
  const demoHtml = "../../../apps/demo/index.html?raw";
  const { default: html } = await import(demoHtml);
  const body = new DOMParser().parseFromString(html, "text/html").body;
  document.body.replaceChildren(...body.childNodes);
  vi.stubEnv("VITE_CHAT_WEBSOCKET_URL", "ws://example.test/chat");
  const subscribe = vi.spyOn(WebSocketTransportAdapter.prototype, "subscribe").mockImplementation(() => () => undefined);
  const send = vi.spyOn(WebSocketTransportAdapter.prototype, "sendMessage");
  const demoEntry = "../../../apps/demo/src/main.ts";

  await act(async () => { await import(demoEntry); });

  const assertCredits = () => {
    const credits = document.querySelector<HTMLElement>("[aria-label='Créditos de TMDB']");
    expect(credits).not.toBeNull();
    expect(credits?.textContent).toBe("This product uses the TMDB API but is not endorsed or certified by TMDB.");
    expect(credits?.closest("[hidden], [role='log']")).toBeNull();
    expect(credits?.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(document.querySelector("textarea")).not.toBeNull();
  };
  assertCredits();
  act(() => { document.querySelector<HTMLButtonElement>("[data-new-conversation]")?.click(); });
  assertCredits();
  expect(subscribe).toHaveBeenCalledTimes(2);
  expect(send).not.toHaveBeenCalled();
  const books = document.querySelector("[data-help-dialog] a");
  expect(books?.textContent).toBe("Google Books");
  expect(books?.getAttribute("href")).toBe("https://books.google.com");
});
