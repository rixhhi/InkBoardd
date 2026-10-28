import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { compactEvents, highlighterAlpha, strokeWidthPx } from "@inkboard/shared/dcn";
import {
  applyCam,
  canvasNeedsResize,
  drawFilled,
  drawStroke,
  fit16x9,
  heldSlideImage,
  inkPaintMs,
  keepLiveRaster,
  paintInkCtx,
  paintSlideCtx,
  shouldSwapLiveBitmap,
  slideFill,
} from "./whiteboard-paint.ts";

function ev(plugin: string, p_time: number, data: Record<string, unknown>) {
  return { plugin, p_time, data };
}

function mockCtx() {
  const ops: string[] = [];
  return {
    ops,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "",
    lineJoin: "",
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "",
    save() {
      ops.push("save");
    },
    restore() {
      ops.push("restore");
    },
    beginPath() {
      ops.push("begin");
    },
    moveTo() {
      ops.push("move");
    },
    lineTo() {
      ops.push("line");
    },
    quadraticCurveTo() {
      ops.push("quad");
    },
    arc() {
      ops.push("arc");
    },
    stroke() {
      ops.push("stroke");
    },
    fill() {
      ops.push("fill");
    },
    fillRect() {
      ops.push("fillRect");
    },
    clearRect() {
      ops.push("clear");
    },
    clip() {
      ops.push("clip");
    },
    rect() {
      ops.push("rect");
    },
    translate() {
      ops.push("translate");
    },
    scale() {
      ops.push("scale");
    },
    rotate() {
      ops.push("rotate");
    },
    ellipse() {
      ops.push("ellipse");
    },
    setLineDash() {
      ops.push("dash");
    },
    setTransform() {
      ops.push("setTransform");
    },
    drawImage() {
      ops.push("drawImage");
    },
  } as unknown as CanvasRenderingContext2D & { ops: string[] };
}

describe("whiteboard paint", () => {
  it("fits a 16:9 board into the stage", () => {
    const wide = fit16x9(1920, 800);
    assert.equal(wide.h, 800);
    assert.equal(wide.w, Math.round((16 / 9) * 800));
    const tall = fit16x9(800, 900);
    assert.equal(tall.w, 800);
    assert.equal(tall.h, Math.round((9 / 16) * 800));
    assert.deepEqual(fit16x9(0, 0), { w: 320, h: 180 });
  });

  it("keeps iron fill until a slide image actually lands — a URL alone is not a white board", () => {
    assert.equal(slideFill({ url: "/api/slide?u=x", bc: "#202022" }), "#202022");
    assert.equal(slideFill({ url: "/api/slide?u=x", bc: "#202022" }, true), "#f4f6f8");
    assert.equal(slideFill({ bc: "#ffffff" }), "#202022");
    assert.equal(slideFill({ bc: "#ffffff" }, true), "#ffffff");
    assert.equal(slideFill({ bc: "#202022" }), "#202022");
  });

  it("holds the last ready slide until the next URL has loaded", () => {
    const sticky = { id: "old" };
    const loaded = { id: "new" };
    assert.equal(heldSlideImage({ currentUrl: "/b", loadedUrl: "/a", loaded, sticky }), sticky);
    assert.equal(heldSlideImage({ currentUrl: "/b", loadedUrl: "/b", loaded, sticky }), loaded);
    assert.equal(heldSlideImage({ currentUrl: "/b", loadedUrl: "/b", loaded: null, sticky }), sticky);
    assert.equal(heldSlideImage({ currentUrl: undefined, loadedUrl: "/a", loaded, sticky }), null);
    assert.equal(heldSlideImage({ currentUrl: "", loadedUrl: "/a", loaded, sticky }), null);
    const prev = { id: "keep" };
    assert.equal(keepLiveRaster(prev, null), prev);
    assert.equal(keepLiveRaster(prev, loaded), loaded);
    assert.equal(shouldSwapLiveBitmap({ prev: { naturalWidth: 800 }, next: { naturalWidth: 1280 } }), true);
    assert.equal(shouldSwapLiveBitmap({ prev: { naturalWidth: 800 }, next: { naturalWidth: 0 } }), false);
    assert.equal(shouldSwapLiveBitmap({ prev: { naturalWidth: 800 }, next: { naturalWidth: 8 } }), false);
    assert.equal(canvasNeedsResize({ width: 10, height: 10 }, 10, 10), false);
    assert.equal(canvasNeedsResize({ width: 10, height: 10 }, 12, 10), true);
  });

  it("caps marker width so a 1280 board stays a felt tip, not a blob", () => {
    const thin = strokeWidthPx(1, 1280, "marker");
    const fat = strokeWidthPx(40, 1280, "marker");
    assert.ok(thin >= 0.9 && thin <= 6.5, `thin=${thin}`);
    assert.ok(fat <= 1280 * 0.0048 + 0.01, `fat=${fat}`);
    const erase = strokeWidthPx(8, 1280, "eraser");
    assert.ok(erase >= 14);
  });

  it("paints ink after the slide and skips dead highlighters", () => {
    const ctx = mockCtx();
    const tl = compactEvents("WB1", [
      [
        ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
        ev("dcn", 10_000, { e: "sc", s: 1 }),
        ev("dcn", 20_000, { e: "mc", m: "marker" }),
        ev("cw", 1_000_000, { e: "d", p: { x: 0.1, y: 0.1, oid: "a" } }),
        ev("cw", 1_100_000, { e: "m", p: { x: 0.2, y: 0.2 } }),
        ev("cw", 1_200_000, { e: "u", p: { x: 0.3, y: 0.3 } }),
        ev("dcn", 2_000_000, { e: "mc", m: "highlighter" }),
        ev("cw", 2_100_000, { e: "d", p: { x: 0.4, y: 0.4, oid: "h" } }),
        ev("cw", 2_200_000, { e: "u", p: { x: 0.5, y: 0.5 } }),
      ],
    ]);
    paintSlideCtx(ctx, 1280, 720, tl, 1500, null);
    assert.ok(ctx.ops.includes("fillRect"));
    paintInkCtx(ctx, 1280, 720, tl, 1500);
    assert.ok(ctx.ops.includes("quad") || ctx.ops.includes("stroke") || ctx.ops.includes("line"));
    const high = tl.strokes.find((s) => s.m === "highlighter");
    assert.ok(high);
    assert.equal(highlighterAlpha(high!, 20_000), 0);
  });

  it("draws a stroke as a quadratic path", () => {
    const ctx = mockCtx();
    drawStroke(
      ctx,
      { oid: "a", uid: "s0", t: 0, te: 100, c: "#fff", w: 2, m: "marker", p: [0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4], k: [] },
      1280,
      720,
      50,
    );
    assert.ok(ctx.ops.includes("quad"));
    assert.ok(ctx.ops.includes("stroke"));
  });

  it("paints circle, dashed line, arrow, photos, and slide rotation", () => {
    const tl = compactEvents("WB2", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 10_000, { e: "sc", s: 1 }),
      ev("dcn", 20_000, { e: "mc", m: "circle" }),
      ev("cw", 1_000_000, { e: "d", p: { x: 0.2, y: 0.2, oid: "c" } }),
      ev("cw", 1_100_000, { e: "u", p: { x: 0.4, y: 0.5 } }),
      ev("dcn", 2_000_000, { e: "mc", m: "dashed-line" }),
      ev("cw", 2_100_000, { e: "d", p: { x: 0.1, y: 0.1, oid: "d" } }),
      ev("cw", 2_200_000, { e: "u", p: { x: 0.5, y: 0.1 } }),
      ev("dcn", 3_000_000, { e: "mc", m: "arrow" }),
      ev("cw", 3_100_000, { e: "d", p: { x: 0.1, y: 0.6, oid: "a" } }),
      ev("cw", 3_200_000, { e: "u", p: { x: 0.3, y: 0.8 } }),
      {
        plugin: "cw",
        p_time: 4_000_000,
        data: {
          id: 1,
          data: {
            e: "cio",
            oid: "pic",
            src: "https://uadoc.uacdn.net/live_class/x/shot.png",
            sp: { x: 0.1, y: 0.2 },
            ep: { x: 0.3, y: 0.4 },
          },
        },
      },
      { plugin: "cw", p_time: 5_000_000, data: { id: 1, data: { e: "rs" } } },
    ]]);
    const ink = mockCtx();
    paintInkCtx(ink, 1280, 720, tl, 6_000);
    assert.ok(ink.ops.includes("ellipse"), "circle");
    assert.ok(ink.ops.includes("dash"), "dashed");
    assert.ok(ink.ops.includes("line"), "arrow/line");
    assert.ok(ink.ops.includes("rotate"), "slide rotate");
    const bmp = new Map<string, CanvasImageSource & { naturalWidth: number }>();
    bmp.set(tl.images[0]!.url, { naturalWidth: 64 } as CanvasImageSource & { naturalWidth: number });
    const photo = mockCtx();
    paintInkCtx(photo, 1280, 720, tl, 6_000, 1, bmp);
    assert.ok(photo.ops.includes("drawImage"));
  });

  it("applies camera pan as a translate/scale", () => {
    const ctx = mockCtx();
    applyCam(ctx, 1280, 720, 1.2, 0.1, 0);
    assert.ok(ctx.ops.includes("translate"));
    assert.ok(ctx.ops.includes("scale"));
  });

  it("paints live ink from the board clock, not a stale video frame", () => {
    assert.deepEqual(
      inkPaintMs({ mediaSec: 12, seeking: false, frozenMs: null, lastPaintMs: 0, fallbackMs: 96_000, preferClock: true }),
      { paintMs: 96_000, frozenMs: null },
    );
    assert.deepEqual(
      inkPaintMs({ mediaSec: 3, seeking: true, frozenMs: null, lastPaintMs: 0, fallbackMs: 50_000 }),
      { paintMs: 50_000, frozenMs: null },
    );
    assert.deepEqual(
      inkPaintMs({ mediaSec: 8, seeking: false, frozenMs: null, lastPaintMs: 0 }),
      { paintMs: 8000, frozenMs: null },
    );
  });

  it("fills the board with the raster instead of letterboxing", () => {
    const ctx = mockCtx();
    drawFilled(ctx, { naturalWidth: 1600, naturalHeight: 900 }, 1280, 720);
    assert.ok(ctx.ops.includes("drawImage"));
  });

  it("does not periodically reload the live JPEG (that flash-wipes ink)", () => {
    const board = readFileSync(new URL("./whiteboard.tsx", import.meta.url), "utf8");
    assert.equal(board.includes("2500"), false);
    assert.equal(board.includes("r=${Math.floor"), false);
    assert.ok(board.includes("shouldSwapLiveBitmap"));
    assert.ok(board.includes("keepLiveRaster"));
    assert.ok(board.includes("canvasNeedsResize"));
  });
});
