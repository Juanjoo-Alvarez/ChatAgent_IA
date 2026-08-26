import { describe, expect, it } from "vitest";

import { Message } from "../src/domain/Message";

const createMessage = (
  overrides: Partial<ConstructorParameters<typeof Message>[0]> = {}
): Message =>
  new Message({
    id: "message-1",
    role: "user",
    content: "Hola",
    timestamp: new Date("2026-08-25T10:00:00.000Z"),
    status: "sending",
    ...overrides
  });

describe("Message", () => {
  it("creates a message and protects its timestamp from external mutation", () => {
    const originalTimestamp = new Date("2026-08-25T10:00:00.000Z");
    const message = createMessage({ timestamp: originalTimestamp });

    originalTimestamp.setFullYear(2000);
    const exposedTimestamp = message.timestamp;
    exposedTimestamp.setFullYear(2001);

    expect(message.timestamp.toISOString()).toBe("2026-08-25T10:00:00.000Z");
  });

  it.each([
    [{ id: "   " }, "Message id cannot be empty"],
    [{ content: "\n\t" }, "Message content cannot be empty"],
    [
      { timestamp: new Date("invalid") },
      "Message timestamp must be a valid date"
    ]
  ])("rejects invalid properties", (overrides, expectedMessage) => {
    expect(() => createMessage(overrides)).toThrow(expectedMessage);
  });

  it.each(["sent", "error"] as const)(
    "transitions from sending to %s without mutating the original",
    (status) => {
      const message = createMessage();
      const updated = message.withStatus(status);

      expect(updated).not.toBe(message);
      expect(message.status).toBe("sending");
      expect(updated.status).toBe(status);
      expect(updated.id).toBe(message.id);
    }
  );

  it("returns the same entity when the status does not change", () => {
    const message = createMessage();
    expect(message.withStatus("sending")).toBe(message);
  });

  it("rejects transitions from a terminal status", () => {
    const message = createMessage({ status: "sent" });

    expect(() => message.withStatus("error")).toThrow(
      "Invalid message status transition: sent -> error"
    );
  });
});
