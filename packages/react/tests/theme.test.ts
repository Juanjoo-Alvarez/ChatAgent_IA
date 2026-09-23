import { describe, expect, it } from "vitest";

import { defaultTheme, resolveTheme } from "../src/theme";

describe("theme", () => {
  it("returns the complete default theme when no override is provided", () => {
    expect(resolveTheme()).toEqual(defaultTheme);
  });

  it("merges overrides without mutating the shared default theme", () => {
    const resolved = resolveTheme({ accent: "#0f766e" });

    expect(resolved.accent).toBe("#0f766e");
    expect(resolved.widgetBackground).toBe(defaultTheme.widgetBackground);
    expect(defaultTheme.accent).toBe("#4f46e5");
    expect(Object.isFrozen(resolved)).toBe(true);
  });
});
