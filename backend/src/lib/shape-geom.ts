/**
 * Unacademy's shape library tool ("mc" with m="shape", v=<svg url>). The live
 * player downloads the SVG and stretches it over the box the teacher dragged.
 * Here the SVG is flattened once to unit coordinates (0..1): short straight
 * outlines become line strokes, everything else a polyline. compactEvents
 * places them in the box, so the online and offline players draw the real shape.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ShapeGeom } from "@inkboard/shared/dcn";
import { DATA_DIR } from "../config/env.ts";

const BUNDLED = join(dirname(fileURLToPath(import.meta.url)), "../assets/shapes");
const MAX_SVG = 2 * 1024 * 1024;
const cache = new Map<string, ShapeGeom | null>();

export function shapeName(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !(u.hostname === "uacdn.net" || u.hostname.endsWith(".uacdn.net"))) return null;
    const m = /\/shapes\/([A-Za-z0-9_.-]+\.svg)$/i.exec(u.pathname);
    return m && !m[1]!.startsWith(".") ? m[1]! : null;
  } catch {
    return null;
  }
}

type Pt = [number, number];
type Seg = { kind: "L" | "C"; pts: Pt[] };

function attr(tag: string, name: string): string {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return m ? m[1]! : "";
}
function numAttr(tag: string, name: string): number {
  const n = Number(attr(tag, name));
  return Number.isFinite(n) ? n : 0;
}

/** The two transforms Unacademy's shape SVGs use: translate(x [y]) and matrix(a b c d e f). Anything else is identity. */
export function parseTransform(t: string): number[] {
  const num = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?";
  const mm = new RegExp(`matrix\\(\\s*((?:${num}[\\s,]*){6})\\)`).exec(t);
  if (mm) {
    const v = mm[1]!.trim().split(/[\s,]+/).map(Number);
    if (v.length === 6 && v.every(Number.isFinite)) return v;
  }
  const tr = new RegExp(`translate\\(\\s*(${num})(?:[\\s,]+(${num}))?\\s*\\)`).exec(t);
  if (tr) return [1, 0, 0, 1, Number(tr[1]) || 0, Number(tr[2] ?? 0) || 0];
  return [1, 0, 0, 1, 0, 0];
}

export function svgToGeom(svg: string): ShapeGeom | null {
  const head = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  let [vx, vy, vw, vh] = (attr(head, "viewBox") || "").split(/[\s,]+/).map(Number);
  if (!(vw! > 0 && vh! > 0)) {
    vx = 0;
    vy = 0;
    vw = numAttr(head, "width");
    vh = numAttr(head, "height");
  }
  if (!(vw! > 0 && vh! > 0)) return null;
  const W = vw!;
  const H = vh!;
  const X0 = vx || 0;
  const Y0 = vy || 0;
  const unitScale = 1 / Math.max(W, H);
  const body = svg.replace(/<defs\b[\s\S]*?<\/defs>/gi, "").replace(/<clipPath\b[\s\S]*?<\/clipPath>/gi, "");
  const lines: number[][] = [];
  const curves: number[][] = [];
  // Solid parts (fill="#000001" in Unacademy's SVGs): filled, no outline, like the live player.
  // Each filled element keeps all its outlines together, so letters keep their holes.
  const fills: number[][][] = [];
  let fillEl: number[][] = [];
  let filling = false;
  // Current element transform as an SVG matrix [a b c d e f]: x' = a*x + c*y + e, y' = b*x + d*y + f.
  let m: number[] = [1, 0, 0, 1, 0, 0];
  const norm = (p: Pt): Pt => [(m[0]! * p[0] + m[2]! * p[1] + m[4]! - X0) / W, (m[1]! * p[0] + m[3]! * p[1] + m[5]! - Y0) / H];
  const flushSub = (start: Pt | null, segs: Seg[]) => {
    if (!start || !segs.length) return;
    if (filling) {
      const poly: number[] = [...norm(start)];
      for (const s of segs) for (const p of s.pts) poly.push(...norm(p));
      if (poly.length >= 6) fillEl.push(poly);
      return;
    }
    const straight = segs.every((s) => s.kind === "L");
    if (straight && segs.length <= 12) {
      let at = start;
      for (const s of segs) {
        const end = s.pts[s.pts.length - 1]!;
        const a = norm(at);
        const b = norm(end);
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-4) lines.push([a[0], a[1], b[0], b[1]]);
        at = end;
      }
      return;
    }
    const poly: number[] = [...norm(start)];
    for (const s of segs) for (const p of s.pts) poly.push(...norm(p));
    if (poly.length >= 4) curves.push(poly);
  };
  const cubic = (a: Pt, c1: Pt, c2: Pt, b: Pt): Pt[] => {
    const len = (Math.hypot(c1[0] - a[0], c1[1] - a[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(b[0] - c2[0], b[1] - c2[1])) * unitScale;
    const n = Math.max(2, Math.min(10, Math.ceil(len * 60)));
    const out: Pt[] = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      out.push([
        u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
        u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
      ]);
    }
    return out;
  };
  const quad = (a: Pt, c: Pt, b: Pt): Pt[] =>
    cubic(a, [a[0] + (2 / 3) * (c[0] - a[0]), a[1] + (2 / 3) * (c[1] - a[1])], [b[0] + (2 / 3) * (c[0] - b[0]), b[1] + (2 / 3) * (c[1] - b[1])], b);

  const pathD = (d: string) => {
    const tok = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
    let i = 0;
    let cmd = "";
    let cur: Pt = [0, 0];
    let start: Pt | null = null;
    let segs: Seg[] = [];
    let lastC: Pt | null = null;
    let lastQ: Pt | null = null;
    const nextNum = () => Number(tok[i++]);
    const isNum = () => i < tok.length && !/^[A-Za-z]$/.test(tok[i]!);
    while (i < tok.length) {
      if (/^[A-Za-z]$/.test(tok[i]!)) cmd = tok[i++]!;
      else if (!cmd) {
        i++;
        continue;
      }
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const P = (x: number, y: number): Pt => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
      if (C === "Z") {
        if (start && (cur[0] !== start[0] || cur[1] !== start[1])) segs.push({ kind: "L", pts: [start] });
        flushSub(start, segs);
        segs = [];
        if (start) cur = start;
        start = null;
        lastC = lastQ = null;
        continue;
      }
      if (!isNum()) continue;
      if (C === "M") {
        flushSub(start, segs);
        segs = [];
        cur = P(nextNum(), nextNum());
        start = cur;
        cmd = rel ? "l" : "L";
        lastC = lastQ = null;
        continue;
      }
      if (!start) start = cur;
      if (C === "L") {
        cur = P(nextNum(), nextNum());
        segs.push({ kind: "L", pts: [cur] });
        lastC = lastQ = null;
      } else if (C === "H") {
        const x = nextNum();
        cur = [rel ? cur[0] + x : x, cur[1]];
        segs.push({ kind: "L", pts: [cur] });
        lastC = lastQ = null;
      } else if (C === "V") {
        const y = nextNum();
        cur = [cur[0], rel ? cur[1] + y : y];
        segs.push({ kind: "L", pts: [cur] });
        lastC = lastQ = null;
      } else if (C === "C" || C === "S") {
        const c1: Pt = C === "C" ? P(nextNum(), nextNum()) : lastC ? [2 * cur[0] - lastC[0], 2 * cur[1] - lastC[1]] : cur;
        const c2 = P(nextNum(), nextNum());
        const b = P(nextNum(), nextNum());
        segs.push({ kind: "C", pts: cubic(cur, c1, c2, b) });
        lastC = c2;
        lastQ = null;
        cur = b;
      } else if (C === "Q" || C === "T") {
        const c: Pt = C === "Q" ? P(nextNum(), nextNum()) : lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur;
        const b = P(nextNum(), nextNum());
        segs.push({ kind: "C", pts: quad(cur, c, b) });
        lastQ = c;
        lastC = null;
        cur = b;
      } else if (C === "A") {
        for (let k = 0; k < 5; k++) nextNum();
        cur = P(nextNum(), nextNum());
        segs.push({ kind: "C", pts: [cur] });
        lastC = lastQ = null;
      } else {
        i++;
      }
    }
    flushSub(start, segs);
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number) => {
    if (!(rx > 0 && ry > 0)) return;
    const pts: Pt[] = [];
    for (let k = 1; k <= 48; k++) pts.push([cx + rx * Math.cos((k / 48) * 2 * Math.PI), cy + ry * Math.sin((k / 48) * 2 * Math.PI)]);
    flushSub([cx + rx, cy], [{ kind: "C", pts }]);
  };

  const tags = body.match(/<(path|rect|line|circle|ellipse|polygon|polyline)\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = /^<([a-z]+)/i.exec(tag)![1]!.toLowerCase();
    const fill = attr(tag, "fill").toLowerCase();
    const stroke = attr(tag, "stroke").toLowerCase();
    if ((fill === "white" || fill === "#fff" || fill === "#ffffff") && (!stroke || stroke === "none")) continue;
    if ((!fill || fill === "none") && (!stroke || stroke === "none") && name !== "path") continue;
    if (fillEl.length) fills.push(fillEl);
    fillEl = [];
    filling = !!fill && fill !== "none" && fill !== "white" && fill !== "#fff" && fill !== "#ffffff" && fill !== "transparent";
    m = parseTransform(attr(tag, "transform"));
    if (name === "path") pathD(attr(tag, "d"));
    else if (name === "rect") {
      const x = numAttr(tag, "x");
      const y = numAttr(tag, "y");
      const w = numAttr(tag, "width");
      const h = numAttr(tag, "height");
      if (w > 0 && h > 0) flushSub([x, y], [{ kind: "L", pts: [[x + w, y]] }, { kind: "L", pts: [[x + w, y + h]] }, { kind: "L", pts: [[x, y + h]] }, { kind: "L", pts: [[x, y]] }]);
    } else if (name === "line") {
      flushSub([numAttr(tag, "x1"), numAttr(tag, "y1")], [{ kind: "L", pts: [[numAttr(tag, "x2"), numAttr(tag, "y2")]] }]);
    } else if (name === "circle") ellipse(numAttr(tag, "cx"), numAttr(tag, "cy"), numAttr(tag, "r"), numAttr(tag, "r"));
    else if (name === "ellipse") ellipse(numAttr(tag, "cx"), numAttr(tag, "cy"), numAttr(tag, "rx"), numAttr(tag, "ry"));
    else {
      const nums = attr(tag, "points").trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      if (nums.length >= 4) pathD(`M${nums.slice(0, 2).join(" ")} L${nums.slice(2).join(" ")}${name === "polygon" ? " Z" : ""}`);
    }
  }
  if (fillEl.length) fills.push(fillEl);
  fillEl = [];
  m = [1, 0, 0, 1, 0, 0];
  filling = false;
  // World / India maps have tens of thousands of points. Thin them so the timeline stays small.
  const total = curves.reduce((n, c) => n + c.length / 2, 0);
  if (total > 6000) {
    const k = Math.ceil(total / 6000);
    for (let ci = 0; ci < curves.length; ci++) {
      const c = curves[ci]!;
      const n = c.length / 2;
      if (n <= 8) continue;
      const out: number[] = [];
      for (let j = 0; j < n; j++) if (j % k === 0 || j === n - 1) out.push(c[2 * j]!, c[2 * j + 1]!);
      curves[ci] = out;
    }
  }
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  return lines.length || curves.length || fills.length
    ? { lines: lines.map((l) => l.map(r4)), curves: curves.map((c) => c.map(r4)), fills: fills.map((el) => el.map((c) => c.map(r4))) }
    : null;
}

async function readShape(url: string, name: string): Promise<string | null> {
  for (const file of [join(BUNDLED, name), join(DATA_DIR, "shapes", name)]) {
    try {
      if (existsSync(file)) return readFileSync(file, "utf8");
    } catch {
      /* try next */
    }
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0", Referer: "https://unacademy.com/" } });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_SVG || !/<svg\b/i.test(text)) return null;
    try {
      mkdirSync(join(DATA_DIR, "shapes"), { recursive: true });
      writeFileSync(join(DATA_DIR, "shapes", name), text);
    } catch {
      /* cache is optional */
    }
    return text;
  } catch {
    return null;
  }
}

export async function loadShape(url: string): Promise<ShapeGeom | null> {
  if (cache.has(url)) return cache.get(url)!;
  const name = shapeName(url);
  let geom: ShapeGeom | null = null;
  if (name) {
    const text = await readShape(url, name);
    if (text) {
      try {
        geom = svgToGeom(text);
      } catch {
        geom = null;
      }
    }
  }
  cache.set(url, geom);
  return geom;
}

/** Every shape the teacher used in this ink log, ready for compactEvents. Missing ones fall back to a box. */
export async function shapesFor(chunks: unknown): Promise<Map<string, ShapeGeom>> {
  const urls = new Set<string>();
  if (Array.isArray(chunks)) {
    for (const page of chunks) {
      if (!Array.isArray(page)) continue;
      for (const ev of page) {
        const e = ev as { plugin?: unknown; data?: Record<string, unknown> } | null;
        const d = e?.data;
        if (e?.plugin === "dcn" && d && d.e === "mc" && String(d.m ?? "").toLowerCase().trim() === "shape" && typeof d.v === "string") urls.add(d.v);
      }
    }
  }
  const out = new Map<string, ShapeGeom>();
  for (const url of urls) {
    const g = await loadShape(url);
    if (g) out.set(url, g);
  }
  return out;
}
