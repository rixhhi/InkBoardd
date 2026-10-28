import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readStyles } from "./read-styles.ts";

function src(rel: string) {
  const url = new URL(rel, import.meta.url);
  if (rel.endsWith("styles.css")) return readStyles(url);
  return readFileSync(url, "utf8");
}

describe("Phase 3 UX and a11y", () => {
  it("player more-menu has 44px touch rows and named controls", () => {
    const transport = src("../components/player-transport.tsx");
    const menu = src("../components/ui/controls.tsx");
    // The overflow menu is the kit Menu, opened from a named IconButton.
    assert.match(transport, /<Menu/);
    assert.match(transport, /label=\{COPY\.moreControls\}/);
    assert.match(transport, /COPY\.fullscreen/);
    assert.match(transport, /COPY\.hideCamera/);
    assert.match(transport, /sleep15/);
    assert.match(transport, /COPY\.nextClass/);
    assert.match(transport, /COPY\.fold/);
    assert.match(transport, /"Mute"/);
    // Menu rows: Escape closes, items are real menuitems, and rows reach the touch minimum on coarse pointers.
    assert.match(menu, /e\.key === "Escape"/);
    assert.match(menu, /role=\{item\.checked != null \? "menuitemcheckbox" : "menuitem"\}/);
    assert.match(menu, /touch:min-h-\[var\(--hit-min\)\]/);
    const css = src("../styles.css");
    assert.match(css, /--hit-min:\s*44px/);
  });

  it("charts expose a data table for screen readers", () => {
    const kit = src("../components/ui/planner/kit.tsx");
    assert.match(kit, /<table className="sr-only"/);
    assert.match(kit, /<caption>/);
  });

  it("reduced-motion covers the Kalam motion catalog", () => {
    const css = src("../styles.css");
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    // Every motion still in the catalog is named in the reduced-motion block; the kit's ui-* keyframes too.
    for (const name of ["chalk-draw", "eraser-wipe", "strike-draw", "tally-tick", "live-dot", "ui-shimmer", "ui-fade-in", "ui-spin"]) {
      assert.match(css, new RegExp(name));
    }
    // Retired motions (badge shimmer, caret blink, chalk-draw-2/3 stagger) are gone, not just unreferenced.
    for (const gone of ["badge-shimmer", "caret-blink", "chalk-draw-2", "chalk-draw-3"]) {
      assert.doesNotMatch(css, new RegExp(gone));
    }
  });

  it("nav items have plain-language labels", () => {
    const nav = src("../lib/nav.ts");
    const shell = src("../components/shell/app-shell.tsx");
    assert.match(shell, /COPY.search/);
    assert.match(nav, /NAV_ITEMS/);
    assert.match(nav, /label: "Home"/);
    assert.match(nav, /label: "Library"/);
    assert.match(nav, /House/);
    assert.match(nav, /Library/);
    const shortcuts = src("../components/planner/shortcuts.tsx");
    assert.match(shortcuts, /COPY.shortcuts/);
  });

  it("does not load Google Fonts and self-hosts IBM Plex Sans", () => {
    const root = src("../routes/__root.tsx");
    const css = src("../styles.css");
    assert.doesNotMatch(root, /fonts\.googleapis\.com/);
    assert.doesNotMatch(root, /fonts\.gstatic\.com/);
    assert.match(css, /@fontsource\/ibm-plex-sans/);
    assert.match(css, /@fontsource\/source-serif-4/);
    assert.match(css, /IBM Plex Sans Fallback/);
    assert.match(css, /size-adjust/);
  });

  it("planner stays on this device — no remote sync chip", () => {
    const sync = src("../components/planner-sync.tsx");
    assert.doesNotMatch(sync, /bottom-16/);
    assert.doesNotMatch(sync, /loadPlannerState/);
    assert.match(sync, /local-only/);
  });

  it("hub inputs come from the kit, which owns the visible focus ring", () => {
    const hub = src("../components/exam-hub.tsx");
    const input = src("../components/ui/input.tsx");
    // No bare <input> in the hub: the teacher filter is the kit SearchInput…
    assert.doesNotMatch(hub, /<input\b/);
    assert.match(hub, /<SearchInput/);
    // …whose field style paints a focus ring from the token.
    assert.match(input, /focus:shadow-\[0_0_0_2px_var\(--color-ring\)\]/);
  });

  it("keeps seal type at 12px", () => {
    const css = src("../styles.css");
    assert.match(css, /\.text-seal\s*\{[^}]*font-size:\s*var\(--text-caption\)/s);
    assert.match(css, /--text-caption:\s*0\.75rem/);
  });
});
