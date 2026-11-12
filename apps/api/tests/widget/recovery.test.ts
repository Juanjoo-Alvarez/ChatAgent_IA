// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { journeyAgent, movieReply, imdb } from "./fixtures.js";
import { cleanupWidgets, mountClient, send, text, widgetServer } from "./harness.js";

afterEach(cleanupWidgets);

describe("Widget recovery and security boundaries", () => {
  it("recovers a committed but undelivered turn without duplicating the agent or message", async () => {
    const agent = journeyAgent();
    const api = await widgetServer(agent);
    const client = await mountClient(api.base);
    const commit = api.store.commit.bind(api.store);
    let drop = true;
    vi.spyOn(api.store, "commit").mockImplementation(async (...args) => {
      const result = await commit(...args);
      if (drop) { drop = false; client.sockets[0]!.terminate(); }
      return result;
    });
    await send(client.host, "Recomienda una película");
    await text(client.host, "Adaptación de prueba");
    expect(client.sockets).toHaveLength(2);
    expect(agent.respond).toHaveBeenCalledOnce();
    expect(api.createSession).toHaveBeenCalledOnce();
    expect(client.host.querySelectorAll("[data-role=agent]")).toHaveLength(1);
    expect(client.host.querySelectorAll("[data-role=user]")).toHaveLength(1);
    expect(client.host.querySelector("[role=alert]")).toBeNull();
  });

  it("surfaces provider failures without disclosing internal errors", async () => {
    const agent = journeyAgent();
    agent.respond.mockRejectedValueOnce(new Error("fixture-private-secret"));
    const api = await widgetServer(agent);
    const client = await mountClient(api.base);
    await send(client.host, "Recomienda una película");
    await text(client.host, "El servicio no está disponible temporalmente.");
    expect(client.host.textContent).not.toContain("fixture-private-secret");
    expect(client.host.querySelector("[data-status=error]")).not.toBeNull();
  });

  it("does not open tabs when a compromised agent proposes an unsolicited action", async () => {
    const agent = journeyAgent();
    agent.respond.mockResolvedValueOnce({ ...movieReply, actions: [{ type: "open-reference", reference: imdb }] });
    const api = await widgetServer(agent);
    const client = await mountClient(api.base);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await send(client.host, "Recomienda una película");
    await text(client.host, "La operación no está permitida.");
    expect(open).not.toHaveBeenCalled();
    expect(client.host.querySelectorAll("[data-role=agent]")).toHaveLength(0);
  });
});
