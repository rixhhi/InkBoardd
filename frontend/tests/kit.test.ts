import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readStyles } from "../src/lib/read-styles.ts";

const css = readStyles(new URL("../src/styles.css", import.meta.url));
const theme = css.slice(css.indexOf("@theme {"), css.indexOf("}", css.indexOf("@theme {")));
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const overlay = read("../src/components/ui/overlay.tsx");
const controls = read("../src/components/ui/controls.tsx");
const button = read("../src/components/ui/button.tsx");
const feedback = read("../src/components/ui/feedback.tsx");
const index = read("../src/components/ui/index.ts");

describe("design tokens", () => {
  it("keeps one brand accent, distinct from the old monochrome pair", () => {
    assert.match(theme, /--color-primary:\s*#d9d4c8/);
    assert.match(theme, /--color-accent:\s*#1aa88e/);
    assert.match(theme, /--font-serif:\s*"Source Serif 4"/);
    assert.match(theme, /--radius-board:\s*12px/);
    assert.match(theme, /--color-success:/);
    assert.match(theme, /--color-danger:/);
    assert.match(theme, /--space-4:/);
  });

  it("the kit exports a modal dialog and named controls from one barrel", () => {
    // Dialog/ConfirmDialog sit on Radix, which owns the focus trap, aria-modal, Escape and focus return.
    assert.match(overlay, /export function Dialog/);
    assert.match(overlay, /export function ConfirmDialog/);
    assert.match(overlay, /RadixDialog\.Root/);
    assert.match(overlay, /AlertDialog\.Root/);
    assert.match(overlay, /<IconButton label="Close"/);
    assert.match(button, /aria-label=\{label\}/);
    for (const name of ["Button", "IconButton", "EmptyState", "Tabs", "Toast", "Badge", "Progress", "Ring", "Switch", "Select", "Tooltip", "Menu", "Dialog", "ConfirmDialog"]) {
      assert.match(index, new RegExp(`\\b${name}\\b`), `${name} is exported from @/components/ui`);
    }
    assert.match(controls, /role="switch"/);
    assert.match(controls, /role="tooltip"/);
    assert.match(controls, /role="menu"/);
    assert.match(controls, /e\.key === "Escape"/);
    assert.match(button, /loading/);
    assert.match(button, /"danger"/);
    assert.match(button, /aria-busy/);
    assert.match(feedback, /role="status"/);
    assert.match(css, /--hit-min:\s*44px/);
    assert.match(css, /--text-display:/);
    assert.match(css, /--duration-fast:/);
    assert.match(css, /--measure:\s*65ch/);
    assert.match(css, /pointer:\s*coarse/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  });
});
