import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isThemeMode, nextThemeMode, resolvedTheme } from "@inkboard/shared/theme";

describe("theme", () => {
  it("accepts system/dark/light only", () => {
    assert.equal(isThemeMode("system"), true);
    assert.equal(isThemeMode("dark"), true);
    assert.equal(isThemeMode("sepia"), false);
  });

  it("resolves system from the OS preference", () => {
    assert.equal(resolvedTheme("system", true), "dark");
    assert.equal(resolvedTheme("system", false), "light");
    assert.equal(resolvedTheme("light", true), "light");
  });

  it("cycles lamp system → dark → light → system", () => {
    assert.equal(nextThemeMode("system"), "dark");
    assert.equal(nextThemeMode("dark"), "light");
    assert.equal(nextThemeMode("light"), "system");
  });
});
