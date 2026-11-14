import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadShape, parseTransform, shapeName, shapesFor, svgToGeom } from "./shape-geom.ts";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../assets/shapes");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".svg"));
const url = (name: string) => `https://static.uacdn.net/shapes/${name}`;

function coords(g: NonNullable<ReturnType<typeof svgToGeom>>): number[] {
  return [...g.lines.flat(), ...g.curves.flat(), ...(g.fills ?? []).flat(2)];
}

describe("bundled shape SVGs", () => {
  it("ships the full library", () => {
    assert.equal(FILES.length, 21);
  });

  for (const file of FILES) {
    it(`${file} flattens to finite unit geometry`, () => {
      const g = svgToGeom(readFileSync(join(DIR, file), "utf8"));
      assert.ok(g, "no geometry");
      assert.ok(g.lines.length + g.curves.length + (g.fills?.length ?? 0) > 0, "empty geometry");
      const all = coords(g);
      assert.ok(all.length > 0);
      assert.ok(all.every(Number.isFinite), "NaN or Infinity in output");
      // A shape is placed inside the box the teacher dragged, so it must stay (almost) inside 0..1.
      assert.ok(all.every((v) => v > -0.05 && v < 1.05), `coordinates escape the unit box: ${Math.min(...all)}..${Math.max(...all)}`);
    });

    it(`${file} lines are x,y pairs and curves are whole polylines`, () => {
      const g = svgToGeom(readFileSync(join(DIR, file), "utf8"))!;
      for (const l of g.lines) assert.equal(l.length, 4, "a line is x1,y1,x2,y2");
      for (const c of g.curves) assert.ok(c.length >= 4 && c.length % 2 === 0, "a curve is >=2 points of x,y");
      for (const el of g.fills ?? []) for (const poly of el) assert.ok(poly.length >= 6 && poly.length % 2 === 0, "a fill ring has >=3 points");
    });
  }

  it("is deterministic and rounded to four decimals", () => {
    const svg = readFileSync(join(DIR, "triangle.svg"), "utf8");
    const a = svgToGeom(svg);
    const b = svgToGeom(svg);
    assert.deepEqual(a, b);
    for (const v of coords(a!)) assert.equal(v, Math.round(v * 1e4) / 1e4);
  });

  it("a plain triangle outline is three straight lines", () => {
    const g = svgToGeom(readFileSync(join(DIR, "triangle.svg"), "utf8"))!;
    const segs = g.lines.length;
    assert.ok(segs >= 3, `expected at least 3 line segments, got ${segs} lines + ${g.curves.length} curves`);
  });

  it("loadShape serves a bundled shape without touching the network", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network used");
    }) as typeof fetch;
    try {
      const g = await loadShape(url("hexagon.svg"));
      assert.ok(g);
      const again = await loadShape(url("hexagon.svg"));
      assert.equal(again, g, "second call is served from the in-memory cache");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("svgToGeom edge cases", () => {
  it("returns null when the SVG has no usable size", () => {
    assert.equal(svgToGeom("<svg><path d='M0 0 L1 1'/></svg>"), null);
    assert.equal(svgToGeom("not svg"), null);
  });

  it("returns null for an SVG with a size but no drawable content", () => {
    assert.equal(svgToGeom('<svg viewBox="0 0 10 10"></svg>'), null);
  });

  it("maps a square viewBox path into 0..1", () => {
    const g = svgToGeom('<svg viewBox="0 0 10 10"><path d="M0 0 L10 0 L10 10 L0 10 Z" fill="none" stroke="#000"/></svg>');
    assert.ok(g);
    const all = coords(g);
    assert.ok(Math.min(...all) >= 0 && Math.max(...all) <= 1);
    assert.ok(all.includes(1), "reaches the far edge");
  });
});

describe("shapeName", () => {
  it("accepts https uacdn.net shape links", () => {
    assert.equal(shapeName("https://static.uacdn.net/shapes/cube.svg"), "cube.svg");
    assert.equal(shapeName("https://uacdn.net/shapes/cube.svg"), "cube.svg");
  });

  it("rejects other hosts, schemes, paths and traversal", () => {
    for (const bad of [
      "http://static.uacdn.net/shapes/cube.svg",
      "https://evil.com/shapes/cube.svg",
      "https://uacdn.net.evil.com/shapes/cube.svg",
      "https://static.uacdn.net/other/cube.svg",
      "https://static.uacdn.net/shapes/cube.png",
      "https://static.uacdn.net/shapes/../secret.svg",
      "https://static.uacdn.net/shapes/.hidden.svg",
      "not a url",
      "",
    ]) {
      assert.equal(shapeName(bad), null, bad);
    }
  });
});

describe("shapesFor", () => {
  const shape = (v: string) => ({ plugin: "dcn", data: { e: "mc", m: "shape", v } });

  it("collects each distinct shape link once, from every page", async () => {
    const out = await shapesFor([
      [shape(url("cube.svg")), shape(url("cube.svg"))],
      [shape(url("pentagon.svg")), { plugin: "cw", data: { e: "mc", m: "shape", v: url("hexagon.svg") } }],
    ]);
    assert.deepEqual([...out.keys()].sort(), [url("cube.svg"), url("pentagon.svg")].sort());
  });

  it("ignores non-shape events and malformed input", async () => {
    assert.equal((await shapesFor(null)).size, 0);
    assert.equal((await shapesFor([[{ plugin: "dcn", data: { e: "mc", m: "image", v: url("cube.svg") } }]])).size, 0);
    assert.equal((await shapesFor([null, "x", [null, 1, {}]])).size, 0);
  });

  it("skips links that are not shape-library URLs instead of fetching them", async () => {
    const realFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      throw new Error("must not fetch");
    }) as typeof fetch;
    try {
      const out = await shapesFor([[shape("https://evil.com/shapes/x.svg")]]);
      assert.equal(out.size, 0);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("parseTransform", () => {
  it("reads translate with one or two numbers", () => {
    assert.deepEqual(parseTransform("translate(5 7)"), [1, 0, 0, 1, 5, 7]);
    assert.deepEqual(parseTransform("translate(5)"), [1, 0, 0, 1, 5, 0]);
    assert.deepEqual(parseTransform("translate(0 0.623047)"), [1, 0, 0, 1, 0, 0.623047]);
  });

  it("reads matrix, including a vertical flip", () => {
    assert.deepEqual(parseTransform("matrix(1 0 0 -1 378 398.832)"), [1, 0, 0, -1, 378, 398.832]);
    assert.deepEqual(parseTransform("matrix(1,0,0,1,2,3)"), [1, 0, 0, 1, 2, 3]);
  });

  it("falls back to identity for empty or unsupported transforms", () => {
    const id = [1, 0, 0, 1, 0, 0];
    assert.deepEqual(parseTransform(""), id);
    assert.deepEqual(parseTransform("rotate(45)"), id);
    assert.deepEqual(parseTransform("matrix(1 0 0)"), id);
  });
});

describe("transformed shapes", () => {
  it("places the flipped, translated ellipse in the middle of the box (Hemisphere-base-bottom)", () => {
    const g = svgToGeom(readFileSync(join(DIR, "Hemisphere-base-bottom.svg"), "utf8"))!;
    const all = coords(g);
    assert.ok(Math.min(...all) >= -0.01, `min ${Math.min(...all)}`);
    assert.ok(Math.max(...all) <= 1.01, `max ${Math.max(...all)}`);
  });

  it("applies translate to a drawn element", () => {
    const g = svgToGeom('<svg viewBox="0 0 10 10"><path d="M0 0 L2 0" stroke="#000" transform="translate(5 5)"/></svg>')!;
    assert.deepEqual(g.lines[0], [0.5, 0.5, 0.7, 0.5]);
  });
});
