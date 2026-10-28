import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compactEvents,
  highlighterAlpha,
  HIGHLIGHTER_HOLD_MS,
  isBoardClass,
  visibleStrokes,
} from "@inkboard/shared/dcn";

function ev(plugin: string, p_time: number, data: Record<string, unknown>) {
  return { plugin, p_time, data };
}

describe("highlighter flash", () => {
  it("clears previous highlighter on the next stroke and tool switch", () => {
    const tl = compactEvents("TESTLESSON", [
      [
        ev("dcn", 0, { e: "mc", m: "highlighter" }),
        ev("cw", 1_000_000, { e: "d", p: { x: 0.1, y: 0.1, oid: "a" } }),
        ev("cw", 1_100_000, { e: "m", p: { x: 0.2, y: 0.2 } }),
        ev("cw", 1_200_000, { e: "u", p: { x: 0.3, y: 0.3 } }),
        ev("cw", 5_000_000, { e: "d", p: { x: 0.4, y: 0.4, oid: "b" } }),
        ev("cw", 5_200_000, { e: "u", p: { x: 0.5, y: 0.5 } }),
        ev("dcn", 8_000_000, { e: "mc", m: "marker" }),
      ],
    ]);
    const highs = tl.strokes.filter((s) => s.m === "highlighter");
    assert.equal(highs.length, 2);
    assert.equal(highs[0]!.tx, 1_200 + HIGHLIGHTER_HOLD_MS);
    assert.equal(highs[1]!.tx, 5_200 + HIGHLIGHTER_HOLD_MS);

    const at2s = visibleStrokes(tl, 2000, "blank").filter((s) => s.m === "highlighter");
    assert.equal(at2s.length, 1);
    assert.equal(at2s[0]!.oid, "a");
    assert.ok(highlighterAlpha(at2s[0]!, 2000) > 0.4);

    const at6s = visibleStrokes(tl, 6000, "blank").filter((s) => s.m === "highlighter");
    assert.equal(at6s.length, 1);
    assert.equal(at6s[0]!.oid, "b");
    assert.equal(tl.kind, "board");

    const at9s = visibleStrokes(tl, 9000, "blank").filter((s) => s.m === "highlighter");
    assert.equal(at9s.length, 0);
  });

  it("treats empty VIDEO_LIBRARY notes as a full video class", () => {
    const empty = compactEvents("VIDEO_LIBRARY_QMTFGL4HYW", []);
    assert.equal(empty.kind, "video");
    assert.equal(isBoardClass(empty), false);
    const blank = compactEvents("SOMECLASSID", []);
    assert.equal(blank.kind, "video");
    assert.equal(isBoardClass(blank), false);
  });

  it("keeps live board classes on the board + round cam layout", () => {
    const tl = compactEvents("LIVECLASSID12", [
      [
        ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
        ev("dcn", 500_000, { e: "sc", s: 1 }),
      ],
    ]);
    assert.equal(tl.kind, "board");
    assert.equal(isBoardClass(tl), true);
    const asVideoId = compactEvents("VIDEO_LIBRARY_ABC123", [
      [
        ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ],
    ]);
    assert.equal(isBoardClass(asVideoId), false);
  });

  it("auto-fades a lone highlighter after a few seconds", () => {
    const tl = compactEvents("TESTLESSON", [
      [
        ev("dcn", 0, { e: "mc", m: "highlighter" }),
        ev("cw", 1_000_000, { e: "d", p: { x: 0.1, y: 0.1, oid: "solo" } }),
        ev("cw", 1_400_000, { e: "u", p: { x: 0.4, y: 0.2 } }),
      ],
    ]);
    const st = tl.strokes[0]!;
    assert.equal(st.m, "highlighter");
    assert.equal(st.tx, 1400 + HIGHLIGHTER_HOLD_MS);
    assert.equal(visibleStrokes(tl, 2000, "blank").length, 1);
    assert.equal(visibleStrokes(tl, st.tx! + 800, "blank").length, 0);
  });

  it("reads marker-h as permanent wash and highlighter from the down event", () => {
    const tl = compactEvents("TESTLESSON", [
      [
        ev("dcn", 0, { e: "mc", m: "marker-h" }),
        ev("cw", 1_000_000, { e: "d", p: { x: 0.1, y: 0.1, oid: "p" } }),
        ev("cw", 1_200_000, { e: "u", p: { x: 0.2, y: 0.2 } }),
        ev("dcn", 3_000_000, { e: "mc", m: "marker" }),
        ev("cw", 4_000_000, { e: "d", m: "highlighter", p: { x: 0.3, y: 0.3, oid: "h" } }),
        ev("cw", 4_200_000, { e: "u", p: { x: 0.4, y: 0.4 } }),
      ],
    ]);
    assert.equal(tl.strokes[0]!.m, "marker_highlighter");
    assert.equal(tl.strokes[0]!.tx, undefined);
    assert.equal(tl.strokes[1]!.m, "highlighter");
    const later = visibleStrokes(tl, 20_000, "blank");
    assert.equal(later.length, 1);
    assert.equal(later[0]!.m, "marker_highlighter");
  });
});
