import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { peekCopy } from "@inkboard/shared/folio";
import { sideBox } from "../components/player-controls.ts";
import { readStyles } from "./read-styles.ts";

function src(rel: string) {
  const url = new URL(rel, import.meta.url);
  if (rel.endsWith("styles.css")) return readStyles(url);
  return readFileSync(url, "utf8");
}

describe("Patina P7 — phone paper", () => {
  it("peek is a 44px paper rise with a hairline handle, not a grabber pill", () => {
    const css = src("../styles.css");
    const shell = src("../components/shell/app-shell.tsx");
    assert.match(css, /2\.75rem \+ env\(safe-area-inset-bottom/);
    assert.match(css, /\.folio-sheet[\s\S]{0,180}border-top-left-radius: 0/);
    assert.match(css, /\.folio-handle[\s\S]{0,80}height: 1px/);
    const sheet = src("../components/folio/saved-sheet.tsx");
    assert.match(sheet, /folio-handle/);
    // The phone tab bar respects the home-indicator inset.
    assert.match(shell, /function TabBar\(/);
    assert.match(shell, /safe-area-inset-bottom/);
    assert.equal(peekCopy(2, 40, true), "2 left · pull");
    assert.equal(peekCopy(0, 0, false), "Blank · pull");
  });

  it("course actions wrap under the title on a pocket, and shelves do not squeeze a fourth column", () => {
    const css = src("../styles.css");
    assert.match(css, /\.chalk-row \.chalk-actions[\s\S]{0,80}flex-basis: 100%/);
    assert.match(css, /overflow-x: hidden/);
  });

  it("the lantern docks as a corner square on a 390 stage and the rail stays wordless", () => {
    const player = [
      src("../components/class-player.tsx"),
      src("../components/player/use-class-core.ts"),
    ].join("\n");
    const b = sideBox({ width: 390, height: 700 });
    assert.ok(b.w <= 120);
    assert.equal(b.w, b.h);
    assert.match(player, /innerWidth < 640 \? "pip"/);
    assert.match(player, /pocket \? "pip"/);
    assert.doesNotMatch(player, />Dock</);
    assert.doesNotMatch(player, />Rebate</);
  });
});
