import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStyles } from "../read-styles.ts";
import { describe, it } from "node:test";
import { layoutSlate } from "../../components/player-controls.ts";
import { remapSlideUrls } from "@inkboard/shared/bundle/load";
import type { Timeline } from "@inkboard/shared/dcn";

describe("offline player stage", () => {
  it("fills the board with CSS and shrinks it when the film is open", () => {
    const src = readFileSync(new URL("../../features/offline/player/offline-player.tsx", import.meta.url), "utf8");
    assert.match(src, /slate-field is-board/);
    assert.match(src, /has-film/);
    assert.match(src, /boxStyle\(board\)/);
    assert.match(src, /setBoard\(laid\.board\)/);
    const live = readFileSync(new URL("../../components/class-player.tsx", import.meta.url), "utf8");
    assert.match(live, /setBoardBox/);
    assert.match(live, /laid\.board/);
    assert.match(live, /boxStyle\(boardBox\)/);
    assert.doesNotMatch(src, /visibility: "hidden"/);
    assert.doesNotMatch(src, /boardBox/);
    const css = readStyles(new URL("../../styles.css", import.meta.url));
    assert.match(css, /\.slate-field\.is-board/);
    assert.match(css, /\.slate-stage\.has-film \.slate-field\.is-board/);
    const wide = layoutSlate({ width: 1440, height: 780 }, { pip: true });
    assert.ok(wide.board.w >= 1280);
    assert.ok(wide.board.h >= 700);
    const filmed = layoutSlate({ width: 1440, height: 780 }, { pip: true, filmOn: true });
    assert.equal(filmed.board.w, wide.board.w);
    assert.equal(filmed.sideStrip, true);
    assert.ok(filmed.lantern.x < wide.lantern.x);
  });

  it("maps proxied slide urls onto bundle blobs, including by order", () => {
    const orig = "https://uadoc.uacdn.net/slides/a.pdf?page=1";
    const tl = {
      id: "abc123",
      durationMs: 1000,
      videoUrl: "",
      title: "t",
      kind: "board",
      slides: [
        { i: 0, t: 0, uid: "blank", bc: "#202022" },
        { i: 1, t: 1, uid: "s0", bc: "#fff", url: `/api/slide?u=${encodeURIComponent(orig)}` },
      ],
      switches: [],
      cams: [],
      strokes: [],
      erases: [],
      shifts: [],
      images: [],
    } as Timeline;
    const mapped = remapSlideUrls(tl, new Map([[orig, "blob:slide-0"]]));
    assert.equal(mapped.slides[1]?.url, "blob:slide-0");
    const byOrder = remapSlideUrls(tl, new Map([["https://other.example/x.jpg", "blob:order"]]));
    assert.equal(byOrder.slides[1]?.url, "blob:order");
  });
});
