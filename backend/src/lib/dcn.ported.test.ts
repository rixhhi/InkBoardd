import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compactEvents, slideAt, visibleStrokes, type ShapeGeom } from "@inkboard/shared/dcn";

const ev = (plugin: string, p_time: number, data: Record<string, unknown>) => ({ plugin, p_time, data });
const S = 1_000_000; // p_time is microseconds
const down = (t: number, x: number, y: number, oid: string, extra: Record<string, unknown> = {}) => ev("cw", t, { e: "d", p: { x, y, oid, ...extra } });
const move = (t: number, x: number, y: number) => ev("cw", t, { e: "m", p: { x, y } });
const up = (t: number, x: number, y: number) => ev("cw", t, { e: "u", p: { x, y } });
const slide = [ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }), ev("dcn", 1, { e: "sc", s: 1 })];
const pen = (t: number, oid: string, x: number) => [down(t, x, 0.2, oid), move(t + 10_000, x + 0.05, 0.3), up(t + 20_000, x + 0.1, 0.4)];
const alive = (tl: ReturnType<typeof compactEvents>, sec: number) => visibleStrokes(tl, sec * 1000, "s0").filter((s) => s.m !== "eraser");

describe("ported DCN engine: undo / erase-all", () => {
  it("undo removes the last stroke from that moment on, and only then", () => {
    const tl = compactEvents("U1", [[...slide, ...pen(1 * S, "a", 0.1), ...pen(2 * S, "b", 0.3), ev("cw", 3 * S, { e: "un" })]]);
    assert.equal(alive(tl, 2.5).length, 2);
    assert.equal(alive(tl, 3.5).length, 1);
    assert.equal(alive(tl, 3.5)[0]?.oid, "a");
  });

  it("a second undo removes the earlier stroke too; extra undos do nothing", () => {
    const tl = compactEvents("U2", [[...slide, ...pen(1 * S, "a", 0.1), ...pen(2 * S, "b", 0.3), ev("cw", 3 * S, { e: "un" }), ev("cw", 4 * S, { e: "un" }), ev("cw", 5 * S, { e: "un" })]]);
    assert.equal(alive(tl, 4.5).length, 0);
    assert.equal(alive(tl, 5.5).length, 0);
  });

  it("erase-all clears the page and undo brings the strokes back", () => {
    const tl = compactEvents("U3", [[...slide, ...pen(1 * S, "a", 0.1), ...pen(2 * S, "b", 0.3), ev("cw", 3 * S, { e: "ea" }), ev("cw", 4 * S, { e: "un" })]]);
    assert.equal(alive(tl, 2.5).length, 2);
    assert.equal(alive(tl, 3.5).length, 0);
    assert.equal(alive(tl, 4.5).length, 2);
  });

  it("undo is per page: undoing on page 2 does not touch page 1", () => {
    const tl = compactEvents("U4", [[
      ...slide, ...pen(1 * S, "a", 0.1),
      ev("dcn", 2 * S, { e: "as", i: 2, uid: "s1", u: "https://static.uacdn.net/s1.pdf?page=2" }), ev("dcn", 2 * S + 1, { e: "sc", s: 2 }),
      ...pen(3 * S, "b", 0.3), ev("cw", 4 * S, { e: "un" }),
    ]]);
    assert.equal(visibleStrokes(tl, 4500, "s0").length, 1);
    assert.equal(visibleStrokes(tl, 4500, "s1").length, 0);
  });
});

describe("ported DCN engine: shapes", () => {
  const url = "https://static.uacdn.net/shapes/star.svg";
  const geom: ShapeGeom = { lines: [[0, 0, 1, 0]], curves: [], fills: [[[0, 0, 1, 0, 1, 1, 0, 1], [0.25, 0.25, 0.75, 0.25, 0.75, 0.75]]] };
  const drawShape = [
    ev("dcn", 1 * S, { e: "mc", m: "shape", v: url }),
    down(1.1 * S, 0.2, 0.2, "sh1"),
    up(1.2 * S, 0.6, 0.5),
  ];

  it("without geometry a shape falls back to one rectangle stroke", () => {
    const tl = compactEvents("SH0", [[...slide, ...drawShape]]);
    assert.equal(alive(tl, 2).length, 1);
    assert.equal(alive(tl, 2)[0]?.f, undefined);
  });

  it("with geometry it becomes outline + filled pieces scaled into the dragged box", () => {
    const tl = compactEvents("SH1", [[...slide, ...drawShape]], { shapes: new Map([[url, geom]]) });
    const parts = alive(tl, 2);
    assert.equal(parts.length, 2);
    const fill = parts.find((s) => s.f === 1);
    assert.ok(fill, "a filled piece");
    assert.deepEqual(fill.sp, [4]);
    assert.ok(Math.abs(fill.p[0]! - 0.2) < 1e-9 && Math.abs(fill.p[1]! - 0.2) < 1e-9);
    assert.ok(Math.abs(fill.p[4]! - 0.6) < 1e-9 && Math.abs(fill.p[5]! - 0.5) < 1e-9);
    assert.ok(parts.every((s) => s.oid === "sh1"));
  });

  it("undo removes every piece of a multi-piece shape at once", () => {
    const tl = compactEvents("SH2", [[...slide, ...drawShape, ev("cw", 3 * S, { e: "un" })]], { shapes: new Map([[url, geom]]) });
    assert.equal(alive(tl, 2).length, 2);
    assert.equal(alive(tl, 3.5).length, 0);
  });
});

describe("ported DCN engine: shift snap, blank page, short strokes", () => {
  it("a shift-held line snaps to horizontal", () => {
    const tl = compactEvents("SN1", [[
      ...slide,
      ev("dcn", 1 * S, { e: "mc", m: "line" }),
      down(1.1 * S, 0.2, 0.3, "ln", { s: true }),
      up(1.2 * S, 0.7, 0.31),
    ]]);
    const st = alive(tl, 2)[0]!;
    assert.equal(st.p[1], st.p[3]);
    assert.ok(Math.abs(st.p[2]! - 0.7) < 1e-9);
  });

  it("a line without shift is left alone", () => {
    const tl = compactEvents("SN2", [[...slide, ev("dcn", 1 * S, { e: "mc", m: "line" }), down(1.1 * S, 0.2, 0.3, "ln"), up(1.2 * S, 0.7, 0.31)]]);
    assert.notEqual(alive(tl, 2)[0]!.p[1], alive(tl, 2)[0]!.p[3]);
  });

  it("starts on a blank page before any slide is added", () => {
    const tl = compactEvents("BL", [[...pen(1 * S, "a", 0.1)]]);
    assert.equal(slideAt(tl, 0).uid, "blank");
    assert.equal(visibleStrokes(tl, 2000, "blank").length, 1);
  });

  it("keeps a two-point pen stroke (a straight tap-drag) as two points", () => {
    const tl = compactEvents("TP", [[...slide, down(1 * S, 0.2, 0.3, "sh"), up(1.1 * S, 0.4, 0.5)]]);
    const st = alive(tl, 2)[0]!;
    assert.equal(st.p.length, 4);
  });
});
