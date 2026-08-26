import { describe, expect, it } from "vitest";

import { Session } from "../src/domain/Session";

describe("Session", () => {
  it("stores a frozen copy of client metadata", () => {
    const metadata = { tenant: "acme" };
    const session = new Session({ id: "session-1", metadata });

    metadata.tenant = "changed";

    expect(session.metadata).toEqual({ tenant: "acme" });
    expect(Object.isFrozen(session.metadata)).toBe(true);
  });

  it("supports sessions without metadata", () => {
    expect(new Session({ id: "session-1" }).metadata).toBeUndefined();
  });

  it("rejects an empty session id", () => {
    expect(() => new Session({ id: "  " })).toThrow(
      "Session id cannot be empty"
    );
  });
});
