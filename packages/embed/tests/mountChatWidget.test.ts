import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mountChatWidget,
  unmountChatWidget,
  type UnmountChatWidget
} from "../src/mountChatWidget";

const transport = {
  sendMessage: vi.fn(() => Promise.resolve()),
  subscribe: vi.fn(() => () => undefined)
};

const pendingUnmounts: UnmountChatWidget[] = [];

const mount = (
  target: Element | DocumentFragment | string,
  title = "Embedded AGIChat"
): UnmountChatWidget => {
  let unmount: UnmountChatWidget | undefined;

  act(() => {
    unmount = mountChatWidget(target, { transport, title });
  });

  if (unmount === undefined) {
    throw new Error("Expected AGIChat to return an unmount function");
  }

  pendingUnmounts.push(unmount);
  return unmount;
};

afterEach(() => {
  act(() => {
    for (const unmount of pendingUnmounts.splice(0)) {
      unmount();
    }
  });

  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("mountChatWidget", () => {
  it("mounts and unmounts the React widget in an element", () => {
    const target = document.createElement("div");
    document.body.append(target);

    const unmount = mount(target);

    expect(target.querySelector(".agichat-widget")).not.toBeNull();
    expect(target.textContent).toContain("Embedded AGIChat");

    let didUnmount = false;
    act(() => {
      didUnmount = unmount();
    });

    expect(didUnmount).toBe(true);
    expect(target.childElementCount).toBe(0);
  });

  it("resolves a CSS selector as the mount target", () => {
    const target = document.createElement("div");
    target.id = "chat-target";
    document.body.append(target);

    mount("#chat-target", "Support");

    expect(target.textContent).toContain("Support");
  });

  it("rejects a selector that does not match an element", () => {
    expect(() => mountChatWidget("#missing", { transport })).toThrow(
      "AGIChat mount target was not found: #missing"
    );
  });

  it("prevents mounting more than one React root in the same target", () => {
    const target = document.createElement("div");
    mount(target);

    expect(() => mountChatWidget(target, { transport })).toThrow(
      "AGIChat is already mounted in the provided target"
    );
  });

  it("returns false when the target has no mounted widget", () => {
    expect(unmountChatWidget(document.createElement("div"))).toBe(false);
  });
});
