import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readStyles } from "./read-styles.ts";

describe("layered styles", () => {
  it("imports every sheet from the entry and still exposes tokens", () => {
    const entry = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    for (const name of ["tokens", "base", "layout", "components", "pages", "utilities"]) {
      assert.match(entry, new RegExp(`\\./styles/${name}\\.css`));
    }
    const css = readStyles(new URL("../styles.css", import.meta.url));
    assert.match(css, /@theme \{/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /html\[data-theme="light"\]/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  });
});
