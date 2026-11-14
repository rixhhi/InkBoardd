/**
 * Builds a synthetic board lesson for scripts/replay-smoke.mjs.
 *
 *   node --experimental-strip-types scripts/replay-fixture.ts out.json
 *
 * Uses the real compactEvents and the real bundled hexagon SVG, so the browser test exercises
 * the same timeline the backend would serve. Timeline (seconds):
 *   1  pen stroke "a"          2  pen stroke "b"          3  undo (b disappears)
 *   5  erase-all               6  undo (a comes back)     7  hexagon shape, dragged into a box
 *   9  new blank page (no ink)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { compactEvents } from "../shared/src/lib/dcn.ts";
import { svgToGeom } from "../backend/src/lib/shape-geom.ts";

const S = 1_000_000;
const ev = (plugin: string, p_time: number, data: Record<string, unknown>) => ({ plugin, p_time, data });
const down = (t: number, x: number, y: number, oid: string) => ev("cw", t, { e: "d", p: { x, y, oid } });
const move = (t: number, x: number, y: number) => ev("cw", t, { e: "m", p: { x, y } });
const up = (t: number, x: number, y: number) => ev("cw", t, { e: "u", p: { x, y } });
const pen = (t: number, oid: string, x0: number, y0: number, x1: number, y1: number) => [
  down(t, x0, y0, oid),
  move(t + 50_000, (x0 + x1) / 2, (y0 + y1) / 2),
  move(t + 100_000, x1, y1),
  up(t + 150_000, x1, y1),
];

const shapeUrl = "https://static.uacdn.net/shapes/hexagon.svg";
const geom = svgToGeom(readFileSync(new URL("../backend/src/assets/shapes/hexagon.svg", import.meta.url), "utf8"));
if (!geom) throw new Error("hexagon.svg produced no geometry");

const events = [
  ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/replay-smoke/s0.pdf?page=1" }),
  ev("dcn", 1, { e: "sc", s: 1 }),
  ...pen(1 * S, "a", 0.1, 0.2, 0.4, 0.3),
  ...pen(2 * S, "b", 0.1, 0.6, 0.4, 0.7),
  ev("cw", 3 * S, { e: "un" }),
  ev("cw", 5 * S, { e: "ea" }),
  ev("cw", 6 * S, { e: "un" }),
  ev("dcn", 7 * S, { e: "mc", m: "shape", v: shapeUrl }),
  down(7.1 * S, 0.55, 0.15, "hex"),
  up(7.3 * S, 0.9, 0.6),
  ev("dcn", 9 * S, { e: "as", i: 2, uid: "s1", u: "https://static.uacdn.net/replay-smoke/s1.pdf?page=2" }),
  ev("dcn", 9 * S + 1, { e: "sc", s: 2 }),
  // Keep the class running past the last change so the player has somewhere to seek.
  ev("cw", 11 * S, { e: "m", p: { x: 0.5, y: 0.5 } }),
];

const timeline = compactEvents("RPLYSMK01", [events], { shapes: new Map([[shapeUrl, geom]]) });
timeline.title = "Replay smoke";
timeline.durationMs = 12_000;
writeFileSync(process.argv[2] ?? "replay-fixture.json", JSON.stringify(timeline));
console.log(`fixture: ${timeline.strokes.length} strokes, ${timeline.slides.length} slides, ${timeline.erases.length} erases, kind=${timeline.kind}`);
