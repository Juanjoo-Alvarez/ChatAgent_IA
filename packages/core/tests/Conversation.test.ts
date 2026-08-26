import { describe, expect, it } from "vitest";

import { Conversation } from "../src/domain/Conversation";
import { Message } from "../src/domain/Message";

const message = (id: string, status: "sending" | "sent" = "sending") =>
  new Message({
    id,
    role: "user",
    content: `Content ${id}`,
    timestamp: new Date("2026-08-25T10:00:00.000Z"),
    status
  });

describe("Conversation", () => {
  it("keeps initial and newly added messages in insertion order", () => {
    const first = message("first");
    const second = message("second");
    const conversation = new Conversation([first]);

    conversation.addMessage(second);

    expect(conversation.getMessages()).toEqual([first, second]);
  });

  it("returns a new array so callers cannot mutate the conversation", () => {
    const first = message("first");
    const conversation = new Conversation([first]);
    const snapshot = conversation.getMessages() as Message[];

    snapshot.length = 0;

    expect(conversation.getMessages()).toEqual([first]);
  });

  it("rejects duplicate message identifiers", () => {
    const conversation = new Conversation([message("same")]);

    expect(() => conversation.addMessage(message("same"))).toThrow(
      'A message with id "same" already exists'
    );
  });

  it("updates a message status while preserving its position", () => {
    const first = message("first");
    const second = message("second");
    const conversation = new Conversation([first, second]);

    const updated = conversation.updateMessageStatus("first", "sent");

    expect(updated.status).toBe("sent");
    expect(conversation.getMessages()).toEqual([updated, second]);
  });

  it("does not replace a message when its status is unchanged", () => {
    const original = message("first");
    const conversation = new Conversation([original]);

    expect(conversation.updateMessageStatus("first", "sending")).toBe(
      original
    );
  });

  it("rejects updates for unknown messages", () => {
    const conversation = new Conversation();

    expect(() => conversation.updateMessageStatus("missing", "sent")).toThrow(
      'Message with id "missing" was not found'
    );
  });
});
