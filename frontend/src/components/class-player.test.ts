import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  assignMediaTime,
  boxStyle,
  clampBox,
  clampSeek,
  cycleSpeed,
  formatTime,
  jumpSlideTime,
  keepPlayingAfterSeek,
  layoutSlate,
  mediaDuration,
  nextPipSize,
  playerHotkey,
  playGlyph,
  rebatePins,
  repositionLantern,
  seekBarIntent,
  seekBarPct,
  seekBarLayers,
  followMediaClock,
  SEEK_HOLD_MS,
  showSeekSpinner,
  sideBox,
  stepSpeed,
  timeFromClientX,
  bufferedPct,
  tipLeft,
} from "./player-controls.ts";

describe("player controls", () => {
  it("formats time", () => {
    assert.equal(formatTime(0), "0:00");
    assert.equal(formatTime(65), "1:05");
    assert.equal(formatTime(3661), "1:01:01");
  });

  it("does not clamp a skip to 0 when duration is still unknown", () => {
    assert.equal(mediaDuration(Number.POSITIVE_INFINITY, 7200), 7200);
    assert.equal(mediaDuration(Number.NaN, 0), 0);
    assert.equal(mediaDuration(5400, 7200), 5400);
    assert.equal(clampSeek(90, 0), 90);
    assert.equal(clampSeek(90, 80), 80);
    assert.equal(clampSeek(-4, 80), 0);
    assert.equal(seekBarPct(45, 90), 50);
    assert.equal(seekBarPct(10, 0), 0);
    const hover = seekBarLayers({ played: 30, hover: 90, duration: 120, dragging: false });
    assert.equal(hover.fillPct, 25);
    assert.equal(hover.hoverPct, 75);
    assert.equal(hover.tipTime, 90);
    const drag = seekBarLayers({ played: 30, hover: 90, duration: 120, dragging: true });
    assert.equal(drag.fillPct, 75);
    assert.equal(drag.hoverPct, null);
    const idle = seekBarLayers({ played: 30, hover: null, duration: 120, dragging: false });
    assert.equal(idle.tipTime, null);
    assert.equal(idle.fillPct, 25);
    assert.match(tipLeft(50), /50%/);
    const ranges = {
      length: 2,
      start: (i: number) => (i === 0 ? 0 : 40),
      end: (i: number) => (i === 0 ? 20 : 80),
    };
    assert.equal(bufferedPct(ranges, 100), 20);
    assert.equal(bufferedPct({ length: 1, start: () => 0, end: () => 50 }, 100), 50);
  });

  it("assigns currentTime even when fastSeek exists", () => {
    const calls: number[] = [];
    const v = { currentTime: 0, fastSeek: (t: number) => calls.push(t) };
    assignMediaTime(v, 16.5);
    assert.equal(v.currentTime, 16.5);
    assert.deepEqual(calls, []);
  });

  it("maps a pointer on the seek bar to a time", () => {
    assert.equal(timeFromClientX(50, { left: 0, width: 100 }, 200), 100);
    assert.equal(timeFromClientX(-10, { left: 0, width: 100 }, 200), 0);
    assert.equal(timeFromClientX(999, { left: 0, width: 100 }, 200), 200);
    assert.equal(timeFromClientX(10, { left: 0, width: 0 }, 200), 0);
  });

  it("hover previews; only click/drag commits", () => {
    assert.equal(seekBarIntent("move", false), "hover");
    assert.equal(seekBarIntent("move", false, 0), "hover");
    assert.equal(seekBarIntent("leave", false), "clear");
    assert.equal(seekBarIntent("up", false), "clear");
    assert.equal(seekBarIntent("down", false), "scrub");
    assert.equal(seekBarIntent("move", true), "scrub");
    assert.equal(seekBarIntent("move", false, 1), "scrub");
    assert.equal(seekBarIntent("up", true), "commit");
    assert.equal(showSeekSpinner({ ready: true, buffering: true, playing: true, previewing: true }), false);
    assert.equal(showSeekSpinner({ ready: true, buffering: true, playing: true, previewing: false }), true);
    assert.equal(showSeekSpinner({ ready: true, buffering: false, playing: true, previewing: false, seeking: true }), false);
    assert.equal(showSeekSpinner({ ready: false, buffering: false, playing: false, previewing: false }), false);
    assert.equal(playGlyph(true, false), "pause");
    assert.equal(playGlyph(false, false), "play");
    assert.equal(playGlyph(true, true), "play");
    const v = { paused: true, play: async () => { v.paused = false; } };
    keepPlayingAfterSeek(v, true);
    assert.equal(v.paused, false);
    keepPlayingAfterSeek({ paused: true, play: async () => {} }, false);
  });

  it("releases the seek lock so the clock can run after a jump", () => {
    const held = followMediaClock({
      mediaSec: 1002,
      targetSec: 1010,
      seeking: true,
      paused: true,
      lockAgeMs: 120,
    });
    assert.equal(held.time, 1010);
    assert.equal(held.clearLock, false);

    const landed = followMediaClock({
      mediaSec: 1010.2,
      targetSec: 1010,
      seeking: false,
      paused: true,
      lockAgeMs: 200,
    });
    assert.ok(Math.abs(landed.time - 1010.2) < 0.01);
    assert.equal(landed.clearLock, true);

    const timedOut = followMediaClock({
      mediaSec: 478,
      targetSec: 478,
      seeking: true,
      paused: false,
      lockAgeMs: SEEK_HOLD_MS + 50,
    });
    assert.equal(timedOut.clearLock, true);
    assert.equal(timedOut.time, 478);

    const playingAlong = followMediaClock({
      mediaSec: 12.4,
      targetSec: 7.9,
      seeking: false,
      paused: false,
      lockAgeMs: 200,
    });
    assert.equal(playingAlong.clearLock, true);
    assert.equal(playingAlong.time, 12.4);
  });

  it("clamps a round cam inside the stage", () => {
    const b = clampBox({ x: -40, y: 900, w: 140, h: 140 }, { width: 800, height: 450 }, true);
    assert.ok(b.x >= 8 && b.y >= 8);
    assert.ok(b.x + b.w <= 792);
    assert.equal(b.w, b.h);
  });

  it("cycles PiP sizes", () => {
    assert.equal(nextPipSize(96), 140);
    assert.equal(nextPipSize(244), 96);
  });

  it("pins a bookmark onto the slide that was on the board", () => {
    const pins = rebatePins(
      [
        { uid: "a", t: 0 },
        { uid: "b", t: 10_000 },
        { uid: "c", t: 40_000 },
      ],
      [{ seconds: 12 }, { seconds: 41 }],
    );
    assert.equal(pins.has("b"), true);
    assert.equal(pins.has("c"), true);
    assert.equal(pins.has("a"), false);
  });

  it("steps playback speed", () => {
    assert.equal(stepSpeed(1, 1), 1.25);
    assert.equal(stepSpeed(2, 1), 2);
    assert.equal(stepSpeed(1, -1), 0.75);
  });

  it("cycles speed as a single wrapping figure", () => {
    assert.equal(cycleSpeed(1), 1.25);
    assert.equal(cycleSpeed(2), 0.75);
  });

  it("jumps to the longest stretch of a slide", () => {
    const t = jumpSlideTime(
      {
        switches: [
          { t: 0, uid: "a" },
          { t: 10_000, uid: "b" },
          { t: 12_000, uid: "a" },
        ],
        slides: [
          { uid: "a", t: 0 },
          { uid: "b", t: 10_000 },
        ],
        durationMs: 40_000,
      },
      "a",
    );
    assert.ok(t != null && t > 11 && t < 13);
  });

  it("maps J/K/L and digit keys, ignores typing and modifiers", () => {
    const div = { tagName: "DIV" };
    assert.equal(playerHotkey({ key: "k", code: "KeyK" }, div)?.type, "togglePlay");
    assert.equal(playerHotkey({ key: "j", code: "KeyJ" }, div)?.type, "seekBy");
    assert.equal(playerHotkey({ key: "l", code: "KeyL" }, div)?.type, "seekBy");
    assert.equal(playerHotkey({ key: "n", code: "KeyN" }, div, { hasNext: true })?.type, "next");
    assert.equal(playerHotkey({ key: "c", code: "KeyC" }, div)?.type, "toggleCam");
    assert.equal(playerHotkey({ key: "?", code: "Slash", shiftKey: true }, div)?.type, "help");
    assert.equal(playerHotkey({ key: "t", code: "KeyT" }, div)?.type, "sleep");
    assert.equal(playerHotkey({ key: "i", code: "KeyI" }, div)?.type, "skipIntro");
    assert.equal(playerHotkey({ key: "s", code: "KeyS" }, div)?.type, "toggleStrip");
    assert.equal(playerHotkey({ key: ",", code: "Comma" }, div)?.type, "slidePrev");
    assert.equal(playerHotkey({ key: ".", code: "Period" }, div)?.type, "slideNext");
    assert.equal(playerHotkey({ key: "5", code: "Digit5" }, div)?.type, "seekFraction");
    assert.equal(playerHotkey({ key: "k", code: "KeyK" }, { tagName: "INPUT", type: "text" }), null);
    assert.equal(playerHotkey({ key: "k", code: "KeyK", metaKey: true }, div), null);
    assert.equal(playerHotkey({ key: "l", code: "KeyL", defaultPrevented: true }, div), null);
  });

  it("shows slides as a right-side film and hides the camera without a leftover dot", () => {
    const src = readFileSync(new URL("./class-player.tsx", import.meta.url), "utf8");
    assert.match(src, /sideStrip/);
    assert.match(src, /layoutSlate/);
    assert.match(src, /lantern/);
    assert.match(src, /is-off/);
    assert.match(src, /slate-film is-side/);
    assert.match(src, /vertical/);
    assert.match(src, /COPY.hideSlides/);
    assert.match(src, /setStripOn/);
    assert.doesNotMatch(src, /lantern-dark/);
    assert.doesNotMatch(src, /film-rebate-dock/);
    const wide = layoutSlate({ width: 1440, height: 780 }, { pip: true });
    assert.equal(wide.sideStrip, false);
    const filmed = layoutSlate({ width: 1440, height: 780 }, { pip: true, filmOn: true });
    assert.equal(filmed.sideStrip, true);
    const hidden = layoutSlate({ width: 1440, height: 780 }, { camOff: true });
    assert.equal(hidden.lantern.w, 1);
  });

  it("docks the lantern as a corner square on a pocket stage", () => {
    const pocket = sideBox({ width: 390, height: 844 });
    assert.ok(pocket.w <= 120);
    assert.equal(pocket.w, pocket.h);
  });

  it("pins the lantern on the lower-right of a full-stage board", () => {
    const stages = [
      { width: 1440, height: 780 },
      { width: 1100, height: 520 },
      { width: 390, height: 700 },
    ];
    for (const stage of stages) {
      for (const pip of [true, false]) {
        const { board, lantern } = layoutSlate(stage, { pocket: stage.width < 640, pip });
        const availW = stage.width - 16;
        const availH = stage.height - 16;
        assert.ok(
          board.w >= availW * 0.92 || board.h >= availH * 0.92,
          `board not full-stage 16:9 on ${stage.width} pip=${pip} (${board.w}x${board.h})`,
        );
        assert.ok(lantern.x >= board.x - 1, "lantern left of board");
        assert.ok(lantern.x + lantern.w <= board.x + board.w + 2, "lantern past board right");
        assert.ok(lantern.y >= board.y - 1, "lantern above board");
        assert.ok(lantern.y + lantern.h <= board.y + board.h + 2, "lantern below board");
        assert.ok(
          lantern.y + lantern.h > board.y + board.h * 0.55,
          "lantern should sit on the lower board",
        );
        assert.ok(board.x >= 0 && board.y >= 0);
        assert.ok(board.x + board.w <= stage.width);
        assert.ok(board.y + board.h <= stage.height);
        assert.ok(lantern.x + lantern.w <= stage.width + 1);
        assert.ok(lantern.y + lantern.h <= stage.height + 1);
      }
    }
  });

  it("keeps a 360px board above the film band and the rail", () => {
    const stage = { width: 360, height: 640 };
    const open = layoutSlate(stage, { pocket: true, pip: true, filmOn: true, chrome: true });
    assert.ok(open.board.y >= 64, "board should start under the header");
    assert.ok(open.board.y + open.board.h <= stage.height - 68 - 56, "board should clear rail and film");
    assert.ok(open.board.x + open.board.w <= stage.width);
    const shut = layoutSlate(stage, { pocket: true, pip: true, filmOn: true, chrome: false });
    assert.ok(shut.board.y + shut.board.h <= stage.height - 56 - 58, "film stays docked when the rail fades");
    const css = readFileSync(new URL("../styles/pages.css", import.meta.url), "utf8");
    assert.match(css, /max-width:\s*639px/);
    // Film clears the rail: 4.25rem = seek (1.25rem) + controls row (3rem) = layoutSlate's 68px.
    assert.match(css, /\.slate-film\.is-side[\s\S]*bottom:\s*4\.25rem/);
  });

  it("shrinks the board while the bars are open and grows it again when they close", () => {
    const stage = { width: 1440, height: 810 };
    const open = layoutSlate(stage, { pip: true, chrome: true });
    const shut = layoutSlate(stage, { pip: true, chrome: false });
    assert.ok(open.board.h < shut.board.h - 40, "open board should be shorter");
    assert.ok(open.board.y > shut.board.y + 20, "open board should sit below the top bar");
    assert.ok(open.board.y + open.board.h < stage.height - 40, "open board should clear the bottom bar");
    assert.ok(open.lantern.y + open.lantern.h <= open.board.y + open.board.h + 2);
  });

  it("keeps a dragged lantern on the same part of the board across fullscreen", () => {
    const small = layoutSlate({ width: 1000, height: 600 }, { pip: true });
    const dragged = { x: small.board.x + 12, y: small.board.y + 20, w: 96, h: 96 };
    const big = layoutSlate({ width: 1600, height: 900 }, { pip: true });
    const next = repositionLantern(small.board, dragged, big.board, { width: 1600, height: 900 }, true);
    const rx = (next.x - big.board.x) / big.board.w;
    assert.ok(rx < 0.2, "lantern should stay on the left, not snap to the corner");
    assert.ok(Math.abs(next.w / big.board.w - dragged.w / small.board.w) < 0.05);
  });

  it("writes a complete box so a previous right/bottom cannot stick", () => {
    const s = boxStyle({ x: 12, y: 20, w: 800, h: 450 });
    assert.equal(s.right, "auto");
    assert.equal(s.bottom, "auto");
    assert.equal(s.width, 800);
    assert.equal(s.left, 12);
  });

  it("does not scale the lantern video past the clip", () => {
    const src = ["./class-player.tsx", "./player/use-player-model.tsx", "./player/use-playback.ts"]
      .map((f) => readFileSync(new URL(f, import.meta.url), "utf8"))
      .join("\n");
    assert.doesNotMatch(src, /170%/);
    assert.match(src, /boxStyle/);
    assert.doesNotMatch(src, /right: boardRight/);
    assert.doesNotMatch(src, /x: 24, y: 24/);
    assert.doesNotMatch(src, /rail-seek-tip/);
    assert.doesNotMatch(src, /slate-seek-clock/);
    assert.match(src, /seekBarIntent/);
    assert.match(src, /keepPlayingAfterSeek/);
    assert.doesNotMatch(src, /if \(e\.buttons\) seek/);
    assert.match(src, /clampSeek/);
    assert.match(src, /clockMs/);
  });

  it("opens Keep this class from the more tray", () => {
    const src = readFileSync(new URL("./class-player.tsx", import.meta.url), "utf8");
    assert.match(src, /onKeepClass/);
    assert.match(src, /SaveClassDialog/);
    assert.match(src, /setKeepOpen\(true\)/);
  });
});
