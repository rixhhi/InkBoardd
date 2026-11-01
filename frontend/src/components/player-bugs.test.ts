import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { hoverLabel } from "./player-transport.tsx";

const read = (rel: string) => readFileSync(join(import.meta.dirname, rel), "utf8");

describe("player bug fixes", () => {
  it("names a chapter tick when hovering within one percent of it", () => {
    const chapters = [
      { t: 2, label: "Slide 1" },
      { t: 120, label: "Slide 4" },
    ];
    assert.equal(hoverLabel(120.5, chapters, 600), "Slide 4 · 2:00");
    assert.equal(hoverLabel(2, chapters, 600), "Slide 1 · 0:02");
    assert.equal(hoverLabel(60, chapters, 600), "1:00");
    assert.equal(hoverLabel(60, [], 600), "1:00");
    assert.equal(hoverLabel(60, chapters, 0), "1:00");
  });

  it("picks the nearest chapter when two ticks sit within tolerance", () => {
    const chapters = [
      { t: 100, label: "A" },
      { t: 103, label: "B" },
    ];
    assert.equal(hoverLabel(102, chapters, 1000), "B · 1:42");
    assert.equal(hoverLabel(101, chapters, 1000), "A · 1:41");
  });

  it("drags and resizes the lantern in either layout, never on a right-click", () => {
    const src = read("player/use-player-model.tsx");
    assert.match(src, /const lanternLive = round && !camOff && !listen;/);
    assert.doesNotMatch(src, /if \(!stage \|\| layout !== "pip"\) return;/);
    assert.doesNotMatch(src, /function onPointerDown[\s\S]{0,80}if \(layout !== "pip"\) return;/);
    assert.match(src, /if \(e\.pointerType === "mouse" && e\.button !== 0\) return;/);
  });

  it("tracks browser picture-in-picture and shows a placeholder instead of a second teacher", () => {
    const model = read("player/use-player-model.tsx");
    assert.match(model, /addEventListener\("enterpictureinpicture"/);
    assert.match(model, /addEventListener\("leavepictureinpicture"/);
    assert.match(model, /document\.pictureInPictureElement === v/);
    const player = read("class-player.tsx");
    assert.match(player, /\{pip && round && !camOff \? \(/);
    assert.match(player, /className="lantern-pip-note"/);
    assert.match(player, /document\.exitPictureInPicture\?\.\(\)/);
    const css = read("../styles/layout.css");
    assert.match(css, /\.lantern-pip-note \{/);
  });

  it("offers camera size in the transport menu whenever the camera is on", () => {
    const src = read("player-transport.tsx");
    assert.match(src, /\.\.\.\(!camOff && cycleLanternSize \? \[\{ id: "cam-size"/);
    assert.doesNotMatch(src, /layout === "pip" && !camOff && cycleLanternSize/);
  });

  it("portals the menu panel so the player's overflow cannot clip it", () => {
    const src = read("ui/controls.tsx");
    assert.match(src, /import \{ createPortal \} from "react-dom";/);
    assert.match(src, /createPortal\(/);
    assert.match(src, /position: "fixed"/);
    assert.match(src, /!rootRef\.current\?\.contains\(t\) && !menuRef\.current\?\.contains\(t\)/);
  });

  it("gives chapter ticks a tappable hit area", () => {
    const css = read("../styles/player.css");
    assert.match(css, /\.seek-chapter::before \{[\s\S]*?inset: -8px -7px;/);
  });

  it("labels the notes toolbar from the copy deck", () => {
    const src = read("notes-reader.tsx");
    assert.match(src, /label=\{COPY\.takeTheSheets\}/);
    assert.doesNotMatch(src, /label="Download notes"/);
    assert.match(src, /label=\{COPY\.closeNotes\}/);
  });
});
