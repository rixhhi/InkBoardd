import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatSpeed, sideBox } from "../components/player-controls.ts";
import { readStyles } from "./read-styles.ts";

function src(rel: string) {
  const url = new URL(rel, import.meta.url);
  if (rel.endsWith("styles.css")) return readStyles(url);
  return readFileSync(url, "utf8");
}

describe("Patina P4 — wordless hour", () => {
  it("rail is glyphs, time, and one cycling speed — no Dock/Float/Rebate/icon soup", () => {
    const player = [
      src("../components/class-player.tsx"),
      src("../components/player-transport.tsx"),
      src("../components/player/use-playback.ts"),
    ].join("\n");
    assert.match(player, /cycleSpeed/);
    assert.match(player, /COPY\.keysHint/);
    assert.match(player, /COPY\.fortyStand/);
    assert.match(player, /COPY\.slateSlipped/);
    // The transport is now Tailwind + kit icons (ui rebuild Phase C); class names are not a contract.
    assert.match(player, /label=\{glyph === "pause" \? "Pause" : "Play"\}/);
    assert.match(player, /aria-label="Seek"/);
    assert.match(player, /lantern/);
    assert.match(player, /slate-film/);
    assert.match(player, /shouldNudgeBreak\(playedMs\.current, breakNudge\)/);
    assert.doesNotMatch(player, /if \(!focus \|\| !playing\)/);
    assert.doesNotMatch(player, /PLAYER_SPEEDS\.map/);
    assert.doesNotMatch(player, />Dock</);
    assert.doesNotMatch(player, />Float</);
    assert.doesNotMatch(player, />Rebate</);
    assert.doesNotMatch(player, />Break</);
    assert.doesNotMatch(player, />Intro</);
    assert.doesNotMatch(player, /Sleep /);
    assert.doesNotMatch(player, /FocusPad/);
    assert.doesNotMatch(player, /Picture in picture/);
    assert.doesNotMatch(player, /Keyboard shortcuts/);
    assert.doesNotMatch(player, /class CDN/);
  });

  it("locks the hour copy", () => {
    const copy = src("../../../shared/src/lib/copy.ts");
    assert.match(copy, /Forty minutes\. Stand\./);
    assert.match(copy, /Space · C · S · F/);
  });

  it("docks the lantern as a corner square on a pocket stage", () => {
    const b = sideBox({ width: 390, height: 700 });
    assert.ok(b.w <= 120);
    assert.equal(b.w, b.h);
    assert.ok(b.y > 400);
  });

  it("prints speed as a bare figure", () => {
    assert.equal(formatSpeed(1), "1");
    assert.equal(formatSpeed(1.25), "1.25");
  });

  it("live door has no native video chrome", () => {
    const live = src("../components/live-video.tsx");
    assert.match(live, /controls=\{false\}/);
    assert.doesNotMatch(live, /controls(?! *= *\{false\})/);
  });
});

describe("Patina P5 — paper daylight", () => {
  it("hatch is 12% ink and the slate stays iron on paper", () => {
    const css = src("../styles.css");
    assert.match(css, /color-mix\(in srgb, var\(--color-fg\) 12%/);
    assert.match(css, /html\[data-theme="light"\] \.slate/);
    assert.match(css, /html\[data-theme="light"\] \.write-line-overlay/);
    // The slate override re-pins the dark palette tokens so the player/palette stay iron on paper.
    assert.match(css, /html\[data-theme="light"\] \.slate[^{]*\{[^}]*--color-bg: #0e0f12/s);
    assert.match(css, /html\[data-theme="light"\] \.strike-title:after/);
  });

  it("lamp still cycles system → dark → light", () => {
    const theme = src("../../../shared/src/lib/theme.ts");
    assert.match(theme, /if \(mode === "system"\) return "dark"/);
    assert.match(theme, /if \(mode === "dark"\) return "light"/);
  });
});
