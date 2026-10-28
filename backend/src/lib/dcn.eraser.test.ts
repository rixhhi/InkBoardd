import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { affineAt, compactEvents, eraserHits, followEraser, pointsUntil, type Timeline } from "@inkboard/shared/dcn";

function ev(plugin: string, p_time: number, data: Record<string, unknown>) {
  return { plugin, p_time, data: { id: 1, data } };
}

/** Original is erased, then both strokes move. A later eraser sits on the copy. */
function movedTree(): Timeline {
  return compactEvents("tree", [
    [
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s.pdf?page=1" }),
      ev("dcn", 10_000, { e: "sc", s: 1 }),
      ev("dcn", 100_000, { e: "mc", m: "marker" }),
      ev("cw", 1_000_000, { e: "d", p: { x: 0.2, y: 0.2, oid: "orig" } }),
      ev("cw", 1_100_000, { e: "m", p: { x: 0.5, y: 0.2 } }),
      ev("cw", 1_200_000, { e: "u", p: { x: 0.5, y: 0.2 } }),
      ev("cw", 1_500_000, { e: "d", p: { x: 0.0, y: 0.2, oid: "copy" } }),
      ev("cw", 1_600_000, { e: "m", p: { x: 0.12, y: 0.2 } }),
      ev("cw", 1_700_000, { e: "u", p: { x: 0.12, y: 0.2 } }),
      ev("dcn", 1_800_000, { e: "mc", m: "eraser" }),
      ev("cw", 2_000_000, { e: "d", p: { x: 0.25, y: 0.2, oid: "cut" } }),
      ev("cw", 2_200_000, { e: "m", p: { x: 0.4, y: 0.2 } }),
      ev("cw", 2_400_000, { e: "u", p: { x: 0.55, y: 0.2 } }),
      ev("cw", 4_000_000, { e: "tf", t: "s", data: { ids: ["orig", "copy"] } }),
      ev("cw", 4_200_000, { e: "tf", t: "ts", data: { dx: 0.25, dy: 0 } }),
      ev("cw", 4_300_000, { e: "tf", t: "e" }),
      ev("cw", 5_000_000, { e: "d", p: { x: 0.25, y: 0.2, oid: "later" } }),
      ev("cw", 5_200_000, { e: "m", p: { x: 0.32, y: 0.2 } }),
      ev("cw", 5_400_000, { e: "u", p: { x: 0.4, y: 0.2 } }),
    ],
  ]);
}

function drawLine(ctx: import("@napi-rs/canvas").SKRSContext2D, pts: number[], erase: boolean) {
  ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  ctx.beginPath();
  ctx.moveTo(pts[0]! * 200, pts[1]! * 80);
  for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i]! * 200, pts[i + 1]! * 80);
  ctx.stroke();
}

describe("eraser stays on the stroke it hit", () => {
  it("does not cut a stroke that slid under the eraser later", () => {
    const tl = movedTree();
    const hits = eraserHits(tl);
    assert.equal(hits.filter((h) => h.eraser === "cut" && h.oid === "copy").length, 0);
    const hit = hits.find((h) => h.eraser === "cut" && h.oid === "orig");
    assert.ok(hit);
    const er = tl.strokes.find((s) => s.oid === "cut")!;
    const moved = followEraser(er.p, hit!.at, affineAt(tl, 4_600, "orig"));
    assert.ok(Math.abs(moved[0]! - er.p[0]! - 0.25) < 1e-6);
    const late = tl.strokes.find((s) => s.oid === "later")!;
    const at = hits.find((h) => h.eraser === "later" && h.oid === "copy");
    assert.ok(at);
    const same = followEraser(late.p, at!.at, affineAt(tl, late.te, "copy"));
    assert.ok(Math.abs(same[0]! - late.p[0]!) < 1e-6);
    assert.ok(Math.abs(same[1]! - late.p[1]!) < 1e-6);
  });

  it("a moved copy keeps the same pixels as the stroke drawn alone", () => {
    const tl = movedTree();
    const hits = eraserHits(tl);
    const paint = (applyBound: boolean) => {
      const canvas = createCanvas(200, 80);
      const ctx = canvas.getContext("2d");
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      for (const st of tl.strokes) {
        if (st.m === "eraser" || st.oid !== "copy") continue;
        const now = affineAt(tl, 6_000, st.oid);
        const pts = st.p.map((n, i) => (i % 2 === 0 ? now.dx + now.sx * n : now.dy + now.sy * n));
        drawLine(ctx, pts, false);
        if (!applyBound) continue;
        for (const hit of hits.filter((h) => h.oid === st.oid && h.eraser === "cut")) {
          const er = tl.strokes.find((s) => s.oid === hit.eraser)!;
          drawLine(ctx, followEraser(pointsUntil(er, 6_000), hit.at, now), true);
        }
      }
      return canvas.toBuffer("image/png");
    };
    const alone = paint(false);
    const bound = paint(true);
    assert.equal(Buffer.compare(alone, bound), 0);

    const canvas = createCanvas(200, 80);
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    const copy = tl.strokes.find((s) => s.oid === "copy")!;
    const movedCopy = copy.p.map((n, i) => (i % 2 === 0 ? n + 0.25 : n));
    drawLine(ctx, movedCopy, false);
    const er = tl.strokes.find((s) => s.oid === "cut")!;
    drawLine(ctx, er.p, true);
    assert.notEqual(Buffer.compare(alone, canvas.toBuffer("image/png")), 0);
  });

  it("seeking and playing use one transform, and a half-drawn eraser is shorter", () => {
    const tl = movedTree();
    const er = tl.strokes.find((s) => s.oid === "cut")!;
    const times = [er.t, (er.t + er.te) / 2, er.te, 4_600, 6_000];
    for (const t of times) {
      assert.equal(affineAt(tl, t, "orig").dx, affineAt(tl, t, "copy").dx);
    }
    const mid = pointsUntil(er, (er.t + er.te) / 2);
    assert.ok(mid.length >= 2 && mid.length < er.p.length);
    assert.equal(affineAt(tl, 4_600, "orig").dx, 0.25);
  });
});

describe("lecture S3MUI3I6NUFHI6RHDQAG erasers", () => {
  it("the 45:43 drag follows ids that were renamed after the paste", () => {
    const path = "/tmp/ink/data.json";
    if (!existsSync(path)) return;
    const data = JSON.parse(readFileSync(path, "utf8")) as Parameters<typeof compactEvents>[1];
    const tl = compactEvents("S3MUI3I6NUFHI6RHDQAG", data);
    const renamed = [
      "facc0b38", "df9f0c68", "ad46d30f", "54f211e2", "e97ef8bd", "ff84f238", "5aa0b30c",
      "186a0cc9", "9cfc2f31", "2fb070d6", "c7ac6a1a", "aad7166a", "b33412a0", "31fd264a",
      "b989f206", "f9b15c76", "4772bd6d", "b87f84ed", "9903c388", "b2806f89", "83e32abe",
      "5e31bebe", "bd524ba2", "242b1eac", "1666aeac", "0c000748", "482f0c01", "362c7993",
      "4ae9d598",
    ];
    for (const prefix of renamed) {
      const st = tl.strokes.find((s) => s.oid.startsWith(prefix));
      assert.ok(st, prefix);
      const at = affineAt(tl, 2_752_000, st!.oid);
      assert.ok(Math.abs(at.dx + 0.181) < 0.03, prefix);
    }
  });
});
