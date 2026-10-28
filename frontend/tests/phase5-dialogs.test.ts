import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function src(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("Phase 5 dialogs", () => {
  it("settings and calendar use the focus-trapped dialog, not a click-away div", () => {
    const settings = src("../src/components/planner/settings-page.tsx");
    const calendar = src("../src/components/planner/calendar-page.tsx");
    const kit = src("../src/components/ui/overlay.tsx");
    assert.match(settings, /<Dialog/);
    assert.match(calendar, /<Dialog/);
    assert.doesNotMatch(settings, /<div[^>]*role="dialog"/);
    assert.doesNotMatch(settings, /role="alertdialog"/);
    assert.doesNotMatch(calendar, /<div[^>]*role="dialog"/);
    assert.match(settings, /resetTyped !== "DELETE"/);
    assert.match(settings, /createRecoveryPoint\("reset workspace"/);
    // Radix owns Escape/focus-trap; the kit adds a named Close control.
    assert.match(kit, /RadixDialog\.Root/);
    assert.match(kit, /<IconButton label="Close"/);
    assert.match(src("../src/components/ui/button.tsx"), /aria-label=\{label\}/);
  });
});
