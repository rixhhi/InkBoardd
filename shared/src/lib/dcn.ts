export type DrawMode =
  | "marker"
  | "highlighter"
  | "marker_highlighter"
  | "eraser"
  | "line"
  | "dashed_line"
  | "rectangle"
  | "circle"
  | "arrow"
  | "selection";

export type PackedStroke = {
  /** 1 = solid filled outline (shape library parts). */
  f?: 1;
  /** Filled strokes made of several outlines: point index where each later outline starts. */
  sp?: number[];
  t: number;
  te: number;
  tx?: number;
  uid: string;
  c: string;
  w: number;
  m: DrawMode;
  p: number[];
  k: number[];
  oid: string;
};

export type PackedSlide = {
  i: number;
  t: number;
  url?: string;
  uid: string;
  bc: string;
};

export type PackedSwitch = { t: number; uid: string };
export type PackedCam = { t: number; uid: string; z: number; x: number; y: number; r?: number };
export type PackedErase = {
  t: number;
  uid: string;
  kind: "all" | "undo" | "oids";
  oids?: string[];
};
export type PackedShift = {
  t: number;
  oids: string[];
  dx: number;
  dy: number;
  sx?: number;
  sy?: number;
  shx?: number;
  shy?: number;
  rot?: number;
  cx?: number;
  cy?: number;
  /**
   * Kept so older bundles still load. Each sample is one frame of the
   * gesture (a small scale about the pivot), not the size so far.
   */
  abs?: boolean;
  g?: number;
};

/** An eraser only cuts the strokes it was actually on top of when it was drawn. */
export type EraserHit = {
  eraser: string;
  oid: string;
  /** That stroke's transform at the end of the eraser. */
  at: BoardAffine;
};

export type BoardAffine = {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  shx: number;
  shy: number;
  rot: number;
  cx: number;
  cy: number;
};

export type PackedImage = {
  t: number;
  uid: string;
  oid: string;
  url: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type Timeline = {
  id: string;
  durationMs: number;
  videoUrl: string;
  title: string;
  kind: "board" | "video";
  slides: PackedSlide[];
  switches: PackedSwitch[];
  cams: PackedCam[];
  strokes: PackedStroke[];
  erases: PackedErase[];
  shifts: PackedShift[];
  images: PackedImage[];
  /**
   * Filled by compactEvents. Missing on older bundles: eraserHits() builds it.
   * An eraser cuts a stroke only if they overlapped at the eraser's own time.
   */
  eraserHits?: EraserHit[];
};

/** SVG shape from Unacademy's shape library, flattened to unit coordinates (0..1). */
export type ShapeGeom = { lines: number[][]; curves: number[][]; fills?: number[][][] };

type RawEvent = {
  p_time?: number;
  plugin?: string;
  data?: Record<string, unknown>;
};

const BASE_WIDTH = 360;
const MODES = new Set<DrawMode>([
  "marker",
  "highlighter",
  "marker_highlighter",
  "eraser",
  "line",
  "dashed_line",
  "rectangle",
  "circle",
  "arrow",
  "selection",
]);

/** Laser highlighter (H) sits on Unacademy's temp canvas and never commits. */
export const HIGHLIGHTER_HOLD_MS = 2400;
export const HIGHLIGHTER_FADE_MS = 320;

function num(v: unknown, fallback = 0) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function str(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function innerCw(ev: RawEvent): Record<string, unknown> | null {
  const d = ev.data;
  if (!d || typeof d !== "object") return null;
  let node = d as Record<string, unknown>;
  for (let i = 0; i < 4; i += 1) {
    if (str(node.e) || str(node.type)) return node;
    const inner = node.data;
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) break;
    node = inner as Record<string, unknown>;
  }
  return (d as Record<string, unknown>).data && typeof (d as Record<string, unknown>).data === "object"
    ? ((d as Record<string, unknown>).data as Record<string, unknown>)
    : (d as Record<string, unknown>);
}

function parseMode(raw: unknown, fallback: DrawMode): DrawMode {
  const m = str(raw, fallback).toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (m.includes("eras") || m === "rubber" || m === "wipe") return "eraser";
  if (
    m === "marker_h" ||
    m === "markerh" ||
    m === "marker_highlighter" ||
    (m.includes("marker") && m.includes("high"))
  ) {
    return "marker_highlighter";
  }
  if (m.includes("high") || m === "laser" || m === "laser_highlighter") return "highlighter";
  if (m === "dashed_line" || m === "dashedline" || m === "dashed") return "dashed_line";
  if (m === "shape") return "rectangle";
  if (m === "image" || m === "gif") return "selection";
  if (MODES.has(m as DrawMode)) return m as DrawMode;
  return fallback;
}

function isWash(m: DrawMode) {
  return m === "highlighter" || m === "marker_highlighter";
}

function emptyBoardUrl(raw: string) {
  return /\/live_class\/background\/(?:Light|Dark)\.jpg/i.test(raw);
}

export function rewriteSlideUrl(raw: string): string | undefined {
  const url = raw.trim();
  if (!url) return undefined;
  const abs = url.startsWith("http")
    ? url
    : url.startsWith("//")
      ? `https:${url}`
      : `https://uadoc.uacdn.net/${url.replace(/^\/+/, "").replace(/^s3\/uploads\//, "")}`;
  try {
    const host = new URL(abs).hostname;
    if (!(host === "uacdn.net" || host.endsWith(".uacdn.net"))) return abs;
    return `/api/slide?u=${encodeURIComponent(abs)}`;
  } catch {
    return url;
  }
}

/** Inverse of rewriteSlideUrl: original uacdn URL, or the input unchanged. */
export function unproxySlideUrl(u: string): string {
  const raw = String(u ?? "").trim();
  if (!raw) return raw;
  try {
    const url = raw.startsWith("/") ? new URL(raw, "https://inkboard.invalid") : new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "/api/slide" || path.endsWith("/api/slide")) {
      const orig = url.searchParams.get("u");
      if (orig) return orig;
    }
    return raw;
  } catch {
    return raw;
  }
}

function newBlank(t = 0): PackedSlide {
  return { i: 0, t, uid: "blank", bc: "#202022" };
}

/** Unacademy light UADoc paper uses dark ink (#2C3844). Dark canvas uses #EAEAEA. */
export function boardInkColor(bc: string, url = "") {
  const paper = url.includes("/background/Light.jpg") || url.includes("RULED_LIGHT");
  if (paper) return "#2C3844";
  const hex = bc.trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "#EAEAEA";
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#2C3844" : "#EAEAEA";
}

export function compactEvents(
  id: string,
  chunks: RawEvent[][],
  opts?: { liveBoard?: boolean; legacyIds?: boolean; shapes?: Map<string, ShapeGeom> },
): Timeline {
  const events = chunks.flat();
  events.sort((a, b) => num(a.p_time) - num(b.p_time));

  const slides: PackedSlide[] = [newBlank(0)];
  const switches: PackedSwitch[] = [{ t: 0, uid: "blank" }];
  const cams: PackedCam[] = [{ t: 0, uid: "blank", z: 1, x: 0, y: 0 }];
  const strokes: PackedStroke[] = [];
  const erases: PackedErase[] = [];
  const shifts: PackedShift[] = [];
  const images: PackedImage[] = [];
  const highLive: PackedStroke[] = [];
  const byOid = new Map<string, PackedStroke>();
  const byImg = new Map<string, PackedImage>();
  // One paste action (aId) clones many strokes. A later drag sometimes omits the
  // last few ids even though they were part of that paste. Keep the group so the
  // drag can take those siblings with it.
  const pasteGroup = new Map<string, string[]>();
  const pasteAid = new Map<string, string>();
  // Strokes Unacademy stores on a paste as eraserPaths move with that paste.
  const pasteKids = new Map<string, string[]>();
  // `u` events rename a stroke. Later drags still send the old id.
  const renamed = new Map<string, string>();
  // Reverse view of `renamed` and which shift/erase/kid lists hold an id, so a
  // rename touches only what it needs (big lectures do thousands of renames).
  const renamedFrom = new Map<string, Set<string>>();
  const setRename = (prev: string, next: string) => {
    const old = renamed.get(prev);
    if (old !== undefined) renamedFrom.get(old)?.delete(prev);
    renamed.set(prev, next);
    let set = renamedFrom.get(next);
    if (!set) renamedFrom.set(next, (set = new Set()));
    set.add(prev);
  };
  const holders = new Map<string, Set<string[]>>();
  const track = (arr: string[]) => {
    for (const id of arr) {
      let set = holders.get(id);
      if (!set) holders.set(id, (set = new Set()));
      set.add(arr);
    }
    return arr;
  };
  const resolveId = (id: string) => {
    if (opts?.legacyIds) return id;
    let cur = id;
    const seen = new Set<string>();
    while (renamed.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = renamed.get(cur)!;
    }
    return cur;
  };
  const resolveIds = (ids: string[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const next = resolveId(id);
      if (!next || seen.has(next)) continue;
      seen.add(next);
      out.push(next);
    }
    return out;
  };

  let color = "#EAEAEA";
  let penSize = 0.5;
  let eraserSize = 5;
  let mode: DrawMode = "marker";
  let current = 0;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let gesture = 0;
  let lastMs = 0;
  let selected: string[] = [];
  let cur: PackedStroke | null = null;
  // Shape library tool: the SVG picked with the last mode change, and the one the current stroke uses.
  let shapeUrl = "";
  let curShape = "";
  let curShift = false;
  // Objects drawn as several pieces (shapes) share one oid.
  const pieces = new Map<string, PackedStroke[]>();
  const piecesOf = (oid: string): PackedStroke[] => {
    const many = pieces.get(oid);
    if (many) return many;
    const one = byOid.get(oid);
    return one ? [one] : [];
  };
  // Undo is resolved here, per page, into the exact thing it reverts.
  type UndoItem = { k: "kill"; oids: string[]; aid?: string } | { k: "revert"; oids: string[]; at: number } | { k: "noop" };
  const undoStacks = new Map<string, UndoItem[]>();
  const pushUndo = (pageUid: string, item: UndoItem) => {
    const list = undoStacks.get(pageUid);
    if (list) list.push(item);
    else undoStacks.set(pageUid, [item]);
  };
  let loggedGesture = -1;
  let revertN = 0;
  // Undo brings strokes back under a new id; they keep the eraser cuts of the original.
  const revived: [string, string][] = [];
  // Pages the teacher switched to that the recording never added.
  const extraPages = new Map<number, string>();
  const slideRot = new Map<string, number>();

  const uidAt = () => slides[current]?.uid ?? slides[0]!.uid;

  const expireHighlighters = (at: number) => {
    for (const st of highLive) {
      if (st.tx == null || st.tx > at) st.tx = at;
    }
    highLive.length = 0;
  };

  const flush = (te: number) => {
    if (!cur) return;
    cur.te = te;
    if (curShift && cur.p.length >= 4) snapShifted(cur);
    curShift = false;
    const geom = curShape ? opts?.shapes?.get(curShape) : undefined;
    if (geom && cur.p.length >= 4) {
      const p = cur.p;
      const x0 = Math.min(p[0]!, p[p.length - 2]!);
      const y0 = Math.min(p[1]!, p[p.length - 1]!);
      const w = Math.abs(p[p.length - 2]! - p[0]!);
      const h = Math.abs(p[p.length - 1]! - p[1]!);
      const made: PackedStroke[] = [];
      const add = (m: DrawMode, unit: number[], solid = false, starts?: number[]) => {
        const pts: number[] = [];
        for (let i = 0; i + 1 < unit.length; i += 2) pts.push(x0 + unit[i]! * w, y0 + unit[i + 1]! * h);
        if (pts.length < (solid ? 6 : 4)) return;
        const st: PackedStroke = { t: cur!.t, te, uid: cur!.uid, c: cur!.c, w: cur!.w, m, p: pts, k: Array.from({ length: pts.length / 2 }, () => te), oid: cur!.oid };
        if (solid) st.f = 1;
        if (starts && starts.length) st.sp = starts;
        made.push(st);
      };
      for (const ln of geom.lines) add("line", ln);
      for (const cv of geom.curves) add("marker", cv);
      for (const el of geom.fills ?? []) {
        const flat: number[] = [];
        const starts: number[] = [];
        for (const part of el) {
          if (flat.length) starts.push(flat.length / 2);
          for (const v of part) flat.push(v);
        }
        add("marker", flat, true, starts);
      }
      if (made.length) {
        for (const st of made) strokes.push(st);
        byOid.set(cur.oid, made[made.length - 1]!);
        if (made.length > 1) pieces.set(cur.oid, made);
        pushUndo(cur.uid, { k: "kill", oids: [cur.oid] });
        cur = null;
        curShape = "";
        return;
      }
    }
    if (cur.p.length >= 2) {
      if (cur.m === "highlighter") cur.tx = te + HIGHLIGHTER_HOLD_MS;
      strokes.push(cur);
      byOid.set(cur.oid, cur);
      if (cur.m === "highlighter") highLive.push(cur);
      pushUndo(cur.uid, { k: "kill", oids: [cur.oid] });
    }
    cur = null;
    curShape = "";
  };

  // Shift held: lines snap to flat / upright / 45 degrees, boxes and circles to squares.
  // Same rules as Unacademy's getShiftedDeltasForLine / ForRect, on the 16:9 board.
  function snapShifted(st: PackedStroke) {
    const n = st.p.length;
    const ax = st.p[0]! * 16;
    const ay = st.p[1]! * 9;
    let dx = st.p[n - 2]! * 16 - ax;
    let dy = st.p[n - 1]! * 9 - ay;
    if (st.m === "line" || st.m === "dashed_line" || st.m === "arrow") {
      const d = Math.abs(dx) - Math.abs(dy);
      const diag = Math.abs(d) < 0.5 * Math.abs(dx) && Math.abs(d) < 0.5 * Math.abs(dy);
      if (d > 0) dy = diag ? Math.abs(dx) * (dy > 0 ? 1 : -1) : 0;
      else dx = diag ? Math.abs(dy) * (dx > 0 ? 1 : -1) : 0;
    } else if (st.m === "rectangle" || st.m === "circle") {
      if (Math.abs(dx) > Math.abs(dy)) dy = Math.abs(dx) * (dy > 0 ? 1 : -1);
      else dx = Math.abs(dy) * (dx > 0 ? 1 : -1);
    } else return;
    st.p[n - 2] = (ax + dx) / 16;
    st.p[n - 1] = (ay + dy) / 9;
  }

  // Bring objects back as they were at `at` (undo of a delete, erase-all or move).
  const revertTo = (oids: string[], at: number, now: number) => {
    const xfs = xformsAt({ shifts } as unknown as Timeline, at);
    const killByPage = new Map<string, string[]>();
    for (const id of resolveIds(oids)) {
      const src = piecesOf(id).filter((s) => s.m !== "highlighter" && s.m !== "eraser");
      if (!src.length) continue;
      revertN += 1;
      const nid = `${id}~u${revertN}`;
      const xf = xfs.get(id) ?? IDENTITY;
      const made: PackedStroke[] = [];
      for (const s of src) {
        const pts = applyAffine(s.p, xf);
        const st: PackedStroke = { t: now, te: now, uid: s.uid, c: s.c, w: s.w, m: s.m, p: pts, k: Array.from({ length: pts.length / 2 }, () => now), oid: nid };
        if (s.f) st.f = 1;
        if (s.sp) st.sp = s.sp.slice();
        strokes.push(st);
        made.push(st);
      }
      byOid.set(nid, made[made.length - 1]!);
      if (made.length > 1) pieces.set(nid, made);
      const page = src[0]!.uid;
      const list = killByPage.get(page);
      if (list) list.push(id);
      else killByPage.set(page, [id]);
      setRename(id, nid);
      revived.push([id, nid]);
    }
    for (const [page, ids] of killByPage) erases.push({ t: now, uid: page, kind: "oids", oids: track(ids) });
  };

  const aliveOn = (pageUid: string, at: number) => {
    const dead = new Set<string>();
    for (const er of erases) {
      if (er.uid !== pageUid || er.t > at) continue;
      if (er.kind === "all") {
        for (const s of strokes) if (s.uid === pageUid && s.t < er.t) dead.add(s.oid);
      } else if (er.oids) for (const id of er.oids) dead.add(id);
    }
    const out = new Set<string>();
    for (const s of strokes) {
      if (s.uid === pageUid && s.t < at && !dead.has(s.oid) && s.m !== "eraser" && s.m !== "highlighter") out.add(s.oid);
    }
    return [...out];
  };

  const logMove = (pageUid: string, at: number) => {
    if (loggedGesture === gesture || !selected.length) return;
    loggedGesture = gesture;
    pushUndo(pageUid, { k: "revert", oids: selected.slice(), at: at - 0.001 });
  };

  const extraPage = (idx: number, at: number): number | null => {
    if (opts?.liveBoard) return null;
    let pageUid = extraPages.get(idx);
    if (!pageUid) {
      if (idx < slides.length - extraPages.size) return null;
      pageUid = `extra${idx}`;
      slides.push({ i: slides.length, t: at, uid: pageUid, bc: slides[current]?.bc ?? "#202022" });
      extraPages.set(idx, pageUid);
    }
    const at2 = slides.findIndex((sl) => sl.uid === pageUid);
    return at2 >= 0 ? at2 : null;
  };

  const bakePts = (pts: number[], xf: { sx: number; sy: number; dx: number; dy: number; shx: number; shy: number }) => {
    const n = pts.slice();
    for (let i = 0; i < n.length; i += 2) {
      const x = n[i]!;
      const y = n[i + 1]!;
      n[i] = xf.sx * x + xf.shx * y + xf.dx;
      n[i + 1] = xf.shy * x + xf.sy * y + xf.dy;
    }
    return n;
  };

  const bakeRot = (pts: number[], raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return pts;
    const rv = raw as Record<string, unknown>;
    const deg = num(rv.a, num(rv.totalAngle, num(rv.angleDiff)));
    if (!deg) return pts;
    const cx = num(rv.x, num(rv.cx));
    const cy = num(rv.y, num(rv.cy));
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const n = pts.slice();
    for (let i = 0; i < n.length; i += 2) {
      const dx = n[i]! - cx;
      const dy = n[i + 1]! - cy;
      n[i] = cx + dx * cos - dy * sin;
      n[i + 1] = cy + dx * sin + dy * cos;
    }
    return n;
  };

  const flattenPts = (raw: unknown): number[] => {
    if (!Array.isArray(raw)) return [];
    const out: number[] = [];
    for (const item of raw) {
      if (typeof item === "number" && Number.isFinite(item)) {
        out.push(item);
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const inner = o.p && typeof o.p === "object" ? (o.p as Record<string, unknown>) : o;
      out.push(num(inner.x), num(inner.y));
    }
    if (out.length >= 2 && out.every((v) => Math.abs(v) > 1.5)) {
      for (let i = 0; i < out.length; i++) out[i] = out[i]! / BASE_WIDTH;
    }
    return out;
  };

  type Aff6 = { sx: number; sy: number; dx: number; dy: number; shx: number; shy: number };
  const ID6: Aff6 = { sx: 1, sy: 1, dx: 0, dy: 0, shx: 0, shy: 0 };
  // Affine already baked into a clone's points, measured from the ORIGINAL stroke.
  // Originals have none. Unacademy's paste affine is measured from the original
  // stroke, so copying a clone must not apply that baked part a second time.
  const baked = new Map<string, Aff6>();
  const toFull = (a: Aff6) => ({ ...a, rot: 0, cx: 0, cy: 0 });
  const mul6 = (a: Aff6, b: Aff6): Aff6 => {
    const r = composeAffine(toFull(a), toFull(b));
    return { sx: r.sx, sy: r.sy, dx: r.dx, dy: r.dy, shx: r.shx, shy: r.shy };
  };
  const inv6 = (a: Aff6): Aff6 | null => {
    const det = a.sx * a.sy - a.shx * a.shy;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
    const sx = a.sy / det;
    const sy = a.sx / det;
    const shx = -a.shx / det;
    const shy = -a.shy / det;
    return { sx, sy, shx, shy, dx: -(sx * a.dx + shx * a.dy), dy: -(shy * a.dx + sy * a.dy) };
  };
  /**
   * Transform to apply to `src.p` for a paste whose event affine is `xf`.
   * Unacademy measures `xf` from the ORIGINAL stroke: earlier paste(s) + drags since
   * + this paste's own offset (about 0.023, 0.04 when pasted with the usual nudge).
   * An original source has nothing baked, so `xf` applies as is. A clone source
   * already has its earlier paste baked into `src.p`, so only `xf` minus that part
   * is applied. Audit (7 lectures, 107 paste-of-clone events): every one was
   * cumulative, none delta. No "does it match" guard: a nudged paste of a clone
   * does not match the source's on-screen transform and used to fall through to
   * the double-offset path.
   */
  const pasteXf = (src: PackedStroke, xf: Aff6): { xf: Aff6; base: Aff6 } => {
    const b = baked.get(src.oid ?? "");
    if (!b) return { xf, base: xf };
    const bi = inv6(b);
    if (!bi) return { xf, base: mul6(b, xf) };
    return { xf: mul6(bi, xf), base: xf };
  };

  const cloneStroke = (
    src: PackedStroke,
    oid: string,
    destUid: string,
    at: number,
    xf: { sx: number; sy: number; dx: number; dy: number; shx: number; shy: number },
    rv?: unknown,
    paste = false,
  ) => {
    const r = paste ? pasteXf(src, xf) : { xf, base: mul6(baked.get(src.oid ?? "") ?? ID6, xf) };
    baked.set(oid, r.base);
    xf = r.xf;
    const pts = bakeRot(bakePts(src.p, xf), rv);
    if (pts.length < 2) return null;
    const st: PackedStroke = {
      t: at,
      te: at,
      uid: destUid,
      c: src.c,
      w: src.w,
      m: src.m,
      p: pts,
      k: Array.from({ length: pts.length / 2 }, () => at),
      oid,
    };
    if (src.f) st.f = 1;
    if (src.sp) st.sp = src.sp.slice();
    if (src.m === "highlighter") st.tx = at + HIGHLIGHTER_HOLD_MS;
    strokes.push(st);
    byOid.set(oid, st);
    if (st.m === "highlighter") highLive.push(st);
    return st;
  };
  // Copy every piece of an object (shapes are several strokes with one oid).
  const cloneAll = (srcId: string, oid: string, destUid: string, at: number, xf: { sx: number; sy: number; dx: number; dy: number; shx: number; shy: number }, rv?: unknown, paste = false) => {
    const made: PackedStroke[] = [];
    for (const src of piecesOf(srcId)) {
      const st = cloneStroke(src, oid, destUid, at, xf, rv, paste);
      if (st) made.push(st);
    }
    if (made.length > 1) pieces.set(oid, made);
    return made.length > 0;
  };

  const cloneImage = (
    src: PackedImage,
    oid: string,
    destUid: string,
    at: number,
    xf: { sx: number; sy: number; dx: number; dy: number; shx: number; shy: number },
  ) => {
    const pts = bakePts([src.x0, src.y0, src.x1, src.y1], xf);
    const img: PackedImage = {
      t: at,
      uid: destUid,
      oid,
      url: src.url,
      x0: pts[0]!,
      y0: pts[1]!,
      x1: pts[2]!,
      y1: pts[3]!,
    };
    images.push(img);
    byImg.set(oid, img);
  };

  const ptsBox = (pts: number[], xf: { sx: number; sy: number; dx: number; dy: number; shx: number; shy: number }) => {
    const n = pts.length >= 4 ? bakePts(pts, xf) : bakePts([0, 0, 0.2, 0.2], xf);
    return { x0: n[0]!, y0: n[1]!, x1: n[n.length - 2]!, y1: n[n.length - 1]! };
  };

  const affineOf = (raw: Record<string, unknown>, fallback?: Record<string, unknown>) => ({
    sx: num(raw.sx, num(fallback?.sx, 1)),
    sy: num(raw.sy, num(fallback?.sy, 1)),
    dx: num(raw.dx, num(fallback?.dx)),
    dy: num(raw.dy, num(fallback?.dy)),
    shx: num(raw.shx, num(fallback?.shx)),
    shy: num(raw.shy, num(fallback?.shy)),
  });

  const rememberPaste = (aid: string, pasteId: string) => {
    if (!aid || !pasteId) return;
    pasteAid.set(pasteId, aid);
    const list = pasteGroup.get(aid);
    if (list) list.push(pasteId);
    else pasteGroup.set(aid, [pasteId]);
  };

  // If a drag names almost every clone from one paste, the omitted tail was
  // dropped from the id list, not left behind on purpose. An extra id that was
  // never pasted must not cancel that.
  const expandPasteGroup = (ids: string[]) => {
    if (ids.length < 2) return ids;
    let aid = "";
    const backed: string[] = [];
    for (const id of ids) {
      const a = pasteAid.get(id);
      if (!a) continue;
      if (!aid) aid = a;
      else if (a !== aid) return ids;
      backed.push(id);
    }
    if (backed.length < 2) return ids;
    const group = pasteGroup.get(aid);
    if (!group || group.length <= backed.length) return ids;
    const have = new Set(backed);
    const missing = group.filter((id) => !have.has(id));
    if (!missing.length || missing.length > 8) return ids;
    if (backed.length / group.length < 0.9) return ids;
    return ids.concat(missing);
  };

  const rememberKid = (pasteId: string, kid: string) => {
    if (!pasteId || !kid) return;
    const list = pasteKids.get(pasteId);
    if (list) {
      list.push(kid);
      let set = holders.get(kid);
      if (!set) holders.set(kid, (set = new Set()));
      set.add(list);
    } else pasteKids.set(pasteId, track([kid]));
  };

  const attachPasteKids = (ids: string[]) => {
    const seen = new Set(ids);
    const extra: string[] = [];
    for (const id of ids) {
      const kids = pasteKids.get(id);
      if (!kids) continue;
      for (const kid of kids) {
        const next = resolveId(kid);
        if (!next || seen.has(next)) continue;
        seen.add(next);
        extra.push(next);
      }
    }
    return extra.length ? ids.concat(extra) : ids;
  };

  const retargetId = (from: string, to: string) => {
    if (!from || !to || from === to) return;
    const many = pieces.get(from);
    if (many) {
      pieces.delete(from);
      for (const st of many) st.oid = to;
      pieces.set(to, many);
    }
    const st = byOid.get(from);
    if (st) {
      byOid.delete(from);
      st.oid = to;
      byOid.set(to, st);
    }
    const img = byImg.get(from);
    if (img) {
      byImg.delete(from);
      img.oid = to;
      byImg.set(to, img);
    }
    const aid = pasteAid.get(from);
    if (aid) {
      pasteAid.delete(from);
      pasteAid.set(to, aid);
      const group = pasteGroup.get(aid);
      if (group) {
        const at = group.indexOf(from);
        if (at >= 0) group[at] = to;
      }
    }
    const kids = pasteKids.get(from);
    if (kids) {
      pasteKids.delete(from);
      pasteKids.set(to, kids);
    }
    if (selected.includes(from)) selected = selected.map((id) => (id === from ? to : id));
    const lists = holders.get(from);
    if (lists) {
      holders.delete(from);
      let dest = holders.get(to);
      if (!dest) holders.set(to, (dest = new Set()));
      for (const arr of lists) {
        for (let i = 0; i < arr.length; i++) if (arr[i] === from) arr[i] = to;
        dest.add(arr);
      }
    }
    const prevs = renamedFrom.get(from);
    if (prevs) for (const prev of [...prevs]) setRename(prev, to);
    setRename(from, to);
  };

  for (const ev of events) {
    const t = num(ev.p_time) / 1000;
    lastMs = Math.max(lastMs, t);
    const plugin = ev.plugin;
    const data = innerCw(ev) ?? ((ev.data ?? {}) as Record<string, unknown>);

    if (plugin === "dcn") {
      const e = str(data.e) || str(data.type);
      if (e === "cc" && (data.c || data.color)) color = str(data.c, str(data.color, color));
      else if (e === "pstc") penSize = num(data.s, num(data.size, penSize));
      else if (e === "estc") eraserSize = num(data.s, num(data.size, eraserSize));
      else if (e === "mc") {
        flush(t);
        const rawMode = str(data.m ?? data.mode).toLowerCase().trim();
        shapeUrl = rawMode === "shape" ? str(data.v) : "";
        const next = parseMode(data.m ?? data.mode, mode);
        if (mode === "highlighter" || next === "highlighter") expireHighlighters(t);
        mode = next;
      } else if (e === "as") {
        flush(t);
        expireHighlighters(t);
        const idx = Math.max(0, Math.min(slides.length, Math.round(num(data.i, num(data.index, slides.length)))));
        const incoming =
          str(data.u) || str(data.su) || str(data.publicUrl) || str(data.url) || str(data.staticImgUrl) || str(data.bg);
        const slide: PackedSlide = {
          i: idx,
          t,
          url: rewriteSlideUrl(incoming),
          uid: str(data.uid, `s${slides.length}_${t}`),
          bc: str(data.bc, str(data.backgroundColor, "#202022")),
        };
        const realUrl = str(data.u) || str(data.su) || str(data.publicUrl) || str(data.url) || str(data.staticImgUrl);
        const blankPage = !opts?.liveBoard && !realUrl && emptyBoardUrl(incoming);
        if (blankPage) {
          slide.url = undefined;
          if (/\/live_class\/background\/Light\.jpg/i.test(incoming) && (!slide.bc || slide.bc === "#202022")) slide.bc = "#FFFFFF";
        }
        if (!blankPage && (emptyBoardUrl(incoming) || emptyBoardUrl(slide.url || ""))) {
          if (/\/live_class\/background\/Light\.jpg/i.test(incoming) && slides[current] && (!slides[current]!.bc || slides[current]!.bc === "#202022")) {
            slides[current]!.bc = "#FFFFFF";
          }
        } else {
          slides.splice(idx, 0, slide);
          if (opts?.liveBoard) {
            current = Math.max(0, Math.min(slides.length - 1, idx));
            switches.push({ t, uid: uidAt() });
          } else if (current >= idx) {
            current += 1;
          }
          if (color === "#EAEAEA") color = boardInkColor(slide.bc, slide.url || "");
        }
      } else if (e === "sc") {
        flush(t);
        expireHighlighters(t);
        const want = Math.round(num(data.s, num(data.index, current)));
        const extra = want >= slides.length - extraPages.size || extraPages.has(want) ? extraPage(want, t) : null;
        current = extra ?? Math.max(0, Math.min(slides.length - 1, want));
        switches.push({ t, uid: uidAt() });
      } else if (e === "sbc") {
        const slide = slides[current];
        if (slide && (data.c || data.color)) {
          slide.bc = str(data.c, str(data.color, slide.bc));
          if (color === "#EAEAEA" || color === "#2C3844") color = boardInkColor(slide.bc, slide.url || "");
        }
      }
      continue;
    }

    if (plugin !== "cw" && plugin !== "mcn") continue;
    const wrapper = (ev.data ?? {}) as Record<string, unknown>;
    const inner = data;
    const e = str(inner.e) || str(inner.type);
    const pt = (inner.p ?? {}) as Record<string, unknown>;
    const x = num(pt.x, num(inner.x));
    const y = num(pt.y, num(inner.y));
    // Replays tag ink with wrapper.id (canvas/slide index). Live UADoc sometimes
    // draws on canvas 0 — keep that on the current page. Other live ids (2, 13, 24…)
    // are real PDF pages; dumping them on `current` piles every stroke on one board.
    let canvasIdx = current;
    const rawId = num(wrapper.id, num(inner.id, Number.NaN));
    if (Number.isFinite(rawId)) {
      const idx = Math.round(rawId);
      if (opts?.liveBoard) {
        if (idx >= 1 && idx < slides.length) canvasIdx = idx;
      } else {
        const extra = idx >= slides.length - extraPages.size || extraPages.has(idx) ? extraPage(idx, t) : null;
        canvasIdx = extra ?? idx;
      }
    }
    const uid = slides[Math.max(0, Math.min(slides.length - 1, canvasIdx))]?.uid ?? uidAt();

    if (e === "zm") {
      zoom = num(inner.v, num(inner.zoomValue, zoom));
      cams.push({ t, uid, z: zoom, x: panX, y: panY, r: slideRot.get(uid) });
    } else if (e === "pn") {
      const v = (inner.v ?? {}) as Record<string, unknown>;
      panX = num(v.x, num(inner.translationX, panX));
      panY = num(v.y, num(inner.translationY, panY));
      cams.push({ t, uid, z: zoom, x: panX, y: panY, r: slideRot.get(uid) });
    } else if (e === "tf") {
      const kind = str(inner.t);
      const payload = (inner.data ?? inner) as Record<string, unknown>;
      if (kind === "s") {
        gesture += 1;
        const rawIds = Array.isArray(payload.ids) ? payload.ids : Array.isArray(inner.ids) ? inner.ids : [];
        selected = attachPasteKids(expandPasteGroup(resolveIds(rawIds.map((v) => str(v)).filter(Boolean))));
      } else if (kind === "ts") {
        const dx = num(payload.dx, num(payload.translateX, num(inner.dx)));
        const dy = num(payload.dy, num(payload.translateY, num(inner.dy)));
        if (selected.length && (dx || dy)) { logMove(uid, t); shifts.push({ t, oids: track(selected.slice()), dx, dy }); }
      } else if (kind === "sl") {
        const m = (payload.m ?? {}) as Record<string, unknown>;
        const rv = (payload.rv ?? {}) as Record<string, unknown>;
        const sx = num(payload.sx, num(m.sx, 1));
        const sy = num(payload.sy, num(m.sy, 1));
        const dx = num(m.dx, num(payload.dx));
        const dy = num(m.dy, num(payload.dy));
        const shx = num(m.shx, num(payload.shx));
        const shy = num(m.shy, num(payload.shy));
        const rot = num(rv.a, num(rv.totalAngle, num(payload.dg)));
        const cx = num(rv.x, num(payload.cx, num(payload.centerX)));
        const cy = num(rv.y, num(payload.cy, num(payload.centerY)));
        if (selected.length) {
          logMove(uid, t);
          shifts.push({ t, oids: track(selected.slice()), dx, dy, sx, sy, shx, shy, rot: rot || undefined, cx, cy, abs: true, g: gesture });
        }
      } else if (kind === "e") {
        selected = [];
      } else if (kind === "r") {
        const rot = num(
          payload.dg,
          num(payload.degree, num(payload.a, num(payload.angleDiff, num(payload.totalAngle)))),
        );
        const cx = num(payload.cx, num(payload.centerX, num(payload.x)));
        const cy = num(payload.cy, num(payload.centerY, num(payload.y)));
        if (selected.length && rot) { logMove(uid, t); shifts.push({ t, oids: track(selected.slice()), dx: 0, dy: 0, rot, cx, cy }); }
      }
    } else if (e === "pdo2" || e === "pdo") {
      flush(t);
      const payload = (inner.data ?? {}) as Record<string, unknown>;
      const pathRaw =
        inner.path && typeof inner.path === "object" && !Array.isArray(inner.path)
          ? (inner.path as Record<string, unknown>)
          : payload.path && typeof payload.path === "object" && !Array.isArray(payload.path)
            ? (payload.path as Record<string, unknown>)
            : null;
      const copyId = str(pathRaw?.copyId);
      const pasteId = str(pathRaw?.pasteId);
      const rawPaths = Array.isArray(inner.paths)
        ? inner.paths
        : Array.isArray(payload.paths)
          ? payload.paths
          : [];
      if (pathRaw && copyId && pasteId) {
        rememberPaste(str(inner.aId), pasteId);
        const xf = affineOf(pathRaw);
        cloneAll(resolveId(copyId), pasteId, uid, t, xf, pathRaw.rotationVals, true);
        const aid = str(inner.aId);
        const stack = undoStacks.get(uid);
        const top = stack ? stack[stack.length - 1] : undefined;
        if (top && top.k === "kill" && aid && top.aid === aid) top.oids.push(pasteId);
        else pushUndo(uid, { k: "kill", oids: [pasteId], aid: aid || undefined });
        const img = byImg.get(resolveId(copyId));
        if (img) cloneImage(img, pasteId, uid, t, xf);
        const erasers = Array.isArray(pathRaw.eraserPaths) ? pathRaw.eraserPaths : [];
        for (const raw of erasers) {
          if (!raw || typeof raw !== "object") continue;
          const ep = raw as Record<string, unknown>;
          const from = str(ep.id);
          const to = str(ep.cloneId);
          const esrc = from ? byOid.get(from) : undefined;
          if (!esrc || !to) continue;
          cloneStroke(esrc, to, uid, t, affineOf(ep, pathRaw), ep.rotationVals ?? pathRaw.rotationVals, true);
          rememberKid(pasteId, to);
        }
      } else if (rawPaths.length) {
        for (const raw of rawPaths) {
          if (!raw || typeof raw !== "object") continue;
          const path = raw as Record<string, unknown>;
          const destId = str(path.id) || str(path.pasteId) || str(path.oid);
          const fromId = str(path.copyId);
          const xf = affineOf(
            (path.shift && typeof path.shift === "object" ? (path.shift as Record<string, unknown>) : path),
          );
          if (fromId && destId && cloneAll(resolveId(fromId), destId, uid, t, xf, path.rotationVals)) {
            pushUndo(uid, { k: "kill", oids: [destId] });
          } else {
            const pts = bakeRot(bakePts(flattenPts(path.ppts ?? path.p), xf), path.rotationVals);
            if (pts.length >= 2 && destId) {
              const st: PackedStroke = {
                t,
                te: t,
                uid,
                c: str(path.strokeColor, str(path.c, color)),
                w: num(path.strokeSize, num(path.w, penSize)),
                m: parseMode(path.mode ?? path.m, mode),
                p: pts,
                k: Array.from({ length: pts.length / 2 }, () => t),
                oid: destId,
              };
              strokes.push(st);
              byOid.set(destId, st);
            }
          }
          const imgSrc = str(path.imgSrc) || str(path.src);
          if (imgSrc && destId) {
            const box = ptsBox(flattenPts(path.ppts ?? path.p), xf);
            images.push({
              t,
              uid,
              oid: destId,
              url: rewriteSlideUrl(imgSrc) || imgSrc,
              x0: box.x0,
              y0: box.y0,
              x1: box.x1,
              y1: box.y1,
            });
            byImg.set(destId, images[images.length - 1]!);
          }
          const erasers = Array.isArray(path.eraserPaths) ? path.eraserPaths : [];
          for (const rawE of erasers) {
            if (!rawE || typeof rawE !== "object") continue;
            const ep = rawE as Record<string, unknown>;
            const from = str(ep.id);
            const to = str(ep.cloneId);
            const esrc = from ? byOid.get(from) : undefined;
            if (!esrc || !to) continue;
            cloneStroke(esrc, to, uid, t, affineOf(ep, path), ep.rotationVals ?? path.rotationVals, true);
            rememberKid(destId, to);
          }
        }
      } else {
        const rawObjs = Array.isArray(inner.objects)
          ? inner.objects
          : Array.isArray(payload.objects)
            ? payload.objects
            : null;
        if (rawObjs) {
          for (const raw of rawObjs) {
            if (!raw || typeof raw !== "object") continue;
            const obj = raw as Record<string, unknown>;
            const oid = str(obj.oid) || str(obj.id);
            const dx = num(obj.dx);
            const dy = num(obj.dy);
            if (oid && (dx || dy)) shifts.push({ t, oids: track([resolveId(oid)]), dx, dy });
          }
        } else {
          const ids = Array.isArray(inner.ids)
            ? inner.ids.map((v) => str(v)).filter(Boolean)
            : Array.isArray(payload.ids)
              ? payload.ids.map((v) => str(v)).filter(Boolean)
              : selected.slice();
          const dx = num(inner.dx, num(payload.dx));
          const dy = num(inner.dy, num(payload.dy));
          if (ids.length && (dx || dy)) shifts.push({ t, oids: track(resolveIds(ids)), dx, dy });
        }
      }
    } else if (e === "cio" || e === "pg") {
      const src =
        str(inner.src) ||
        str(inner.imgSrc) ||
        str(pt.src) ||
        str(inner.url) ||
        str(inner.u) ||
        str(pt.url) ||
        str(pt.u) ||
        str(inner.gifSrc) ||
        str(inner.gifUrl);
      const url = rewriteSlideUrl(src);
      const oid = str(inner.oid) || str(inner.objectId) || str(pt.oid) || `${e}_${t}`;
      const sp = (inner.sp ?? inner.startPoint ?? pt.sp ?? pt.startPoint ?? {}) as Record<string, unknown>;
      const ep = (inner.ep ?? inner.endPoint ?? pt.ep ?? pt.endPoint ?? {}) as Record<string, unknown>;
      const x0 = num(sp.x, num(inner.x0, num(pt.x)));
      const y0 = num(sp.y, num(inner.y0, num(pt.y)));
      const x1 = num(ep.x, num(inner.x1, x0 + num(inner.w, 0.24)));
      const y1 = num(ep.y, num(inner.y1, y0 + num(inner.h, 0.24)));
      const hasBox = Boolean(
        inner.sp ||
          inner.ep ||
          inner.startPoint ||
          inner.endPoint ||
          pt.sp ||
          pt.ep ||
          pt.startPoint ||
          pt.endPoint,
      );
      if (url && (hasBox || e === "pg")) {
        const img: PackedImage = { t, uid, oid, url, x0, y0, x1, y1 };
        images.push(img);
        byImg.set(oid, img);
      }
      const slide = slides[current];
      if (e === "cio" && url && slide && (!slide.url || slide.uid === "blank" || slide.uid === "live0") && !hasBox) {
        if (slide.uid === "blank") {
          slides.push({
            i: slides.length,
            t,
            url,
            uid: oid,
            bc: str(inner.bc, str(pt.bc, "#202022")),
          });
          current = slides.length - 1;
          switches.push({ t, uid: uidAt() });
        } else {
          slide.url = url;
        }
      }
    } else if (e === "rs") {
      const prev = slideRot.get(uid) ?? 0;
      const next = prev + (num(inner.a, num(inner.r, 90)) || 90);
      slideRot.set(uid, next);
      cams.push({ t, uid, z: zoom, x: panX, y: panY, r: next });
    } else if (e === "d") {
      flush(t);
      const strokeMode = parseMode(inner.m ?? inner.mode ?? pt.m ?? pt.mode, mode);
      mode = strokeMode;
      expireHighlighters(t);
      if (mode === "selection") continue;
      if (pt.shouldDraw === false) continue;
      curShape = mode === "rectangle" && shapeUrl ? shapeUrl : "";
      curShift = pt.s === true;
      const width = mode === "eraser" ? eraserSize : mode === "marker_highlighter" ? 7 : penSize;
      cur = {
        t,
        te: t,
        uid,
        c: color,
        w: width,
        m: mode,
        p: [x, y],
        k: [t],
        oid: str(pt.oid) || str(inner.objectId) || str(inner.oid) || str(inner.aId) || `k${t}`,
      };
    } else if (e === "m") {
      // `p` is cursor/presence, not ink — mixing it in draws lines across the board.
      if (!cur) continue;
      if (pt.shouldDraw === false) continue;
      if (cur.m === "marker" || isWash(cur.m) || cur.m === "eraser") {
        const n = cur.p.length;
        if (n >= 2) {
          const lx = cur.p[n - 2]!;
          const ly = cur.p[n - 1]!;
          const dx = x - lx;
          const dy = y - ly;
          if (dx * dx + dy * dy < 4e-8) continue;
        }
        cur.p.push(x, y);
        cur.k.push(t);
        cur.te = t;
      } else {
        if (cur.p.length < 4) {
          cur.p.push(x, y);
          cur.k.push(t);
        } else {
          cur.p[2] = x;
          cur.p[3] = y;
          cur.k[1] = t;
        }
        cur.te = t;
      }
    } else if (e === "u" && (Array.isArray(inner.oids) || Array.isArray(inner.eids))) {
      const oids = Array.isArray(inner.oids) ? inner.oids.map((v) => str(v)) : [];
      const eids = Array.isArray(inner.eids) ? inner.eids.map((v) => str(v)) : [];
      const peids = Array.isArray(inner.peids) ? inner.peids.map((v) => str(v)) : [];
      const n = Math.max(oids.length, eids.length);
      for (let i = 0; i < n; i++) retargetId(oids[i] || peids[i] || "", eids[i] || "");
    } else if (e === "u") {
      if (cur) {
        if (cur.m === "line" || cur.m === "dashed_line" || cur.m === "rectangle" || cur.m === "circle" || cur.m === "arrow") {
          if (cur.p.length < 4) {
            cur.p.push(x, y);
            cur.k.push(t);
          } else {
            cur.p[2] = x;
            cur.p[3] = y;
            cur.k[1] = t;
          }
        } else {
          cur.p.push(x, y);
          cur.k.push(t);
        }
        flush(t);
      }
    } else if (e === "ea") {
      flush(t);
      expireHighlighters(t);
      const alive = aliveOn(uid, t);
      erases.push({ t, uid, kind: "all" });
      pushUndo(uid, alive.length ? { k: "revert", oids: alive, at: t - 0.001 } : { k: "noop" });
    } else if (e === "un") {
      flush(t);
      const item = undoStacks.get(uid)?.pop();
      if (item?.k === "kill") {
        const ids = resolveIds(item.oids);
        if (ids.length) erases.push({ t, uid, kind: "oids", oids: track(attachPasteKids(ids).slice()) });
      } else if (item?.k === "revert") {
        revertTo(item.oids, item.at, t);
      }
    } else if (e === "dlos") {
      flush(t);
      const ids = Array.isArray(inner.ids) ? resolveIds(inner.ids.map((v) => str(v)).filter(Boolean)) : [];
      if (ids.length) {
        const all = attachPasteKids(ids);
        erases.push({ t, uid, kind: "oids", oids: track(all.slice()) });
        pushUndo(uid, { k: "revert", oids: all, at: t - 0.001 });
      }
    }
  }
  flush(lastMs);
  for (const st of highLive) {
    if (st.tx == null) st.tx = st.te + HIGHLIGHTER_HOLD_MS;
  }
  slides.forEach((s, i) => {
    s.i = i;
  });

  const hasBoard =
    slides.some((s) => Boolean(s.url)) || strokes.length > 0 || slides.length > 1;
  const kind: Timeline["kind"] =
    id.startsWith("VIDEO_LIBRARY") || !hasBoard ? "video" : "board";

  const tl: Timeline = {
    id,
    durationMs: lastMs,
    videoUrl: `https://uamedia.uacdn.net/lesson-raw/${id}/output.webm`,
    title: "Live class",
    kind,
    slides,
    switches,
    cams,
    strokes,
    erases,
    shifts,
    images,
  };
  tl.eraserHits = bindErasers(tl);
  if (revived.length) {
    const byStroke = new Map<string, EraserHit[]>();
    for (const h of tl.eraserHits) {
      const list = byStroke.get(h.oid);
      if (list) list.push(h);
      else byStroke.set(h.oid, [h]);
    }
    for (const [from, to] of revived) {
      for (const h of byStroke.get(from) ?? []) tl.eraserHits.push({ eraser: h.eraser, oid: to, at: { ...h.at } });
      const chain = byStroke.get(to);
      if (chain) byStroke.set(to, chain.concat(byStroke.get(from) ?? []));
      else byStroke.set(to, (byStroke.get(from) ?? []).map((h) => ({ ...h, oid: to })));
    }
  }
  return tl;
}

/** True only for live board + webcam classes — never tablet/video-library recordings. */
export function isBoardClass(tl: Pick<Timeline, "id" | "kind" | "slides" | "strokes">): boolean {
  if (tl.id.startsWith("VIDEO_LIBRARY")) return false;
  if (tl.kind !== "board") return false;
  return tl.slides.some((s) => Boolean(s.url)) || tl.strokes.length > 0;
}

function lastAt<T extends { t: number }>(arr: T[], t: number): T | undefined {
  let lo = 0;
  let hi = arr.length - 1;
  let ans: T | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]!.t <= t) {
      ans = arr[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function slideAt(tl: Timeline, t: number) {
  const sw = lastAt(tl.switches, t);
  if (sw) {
    const hit = tl.slides.find((s) => s.uid === sw.uid);
    if (hit) return hit;
  }
  return tl.slides[0] ?? newBlank(0);
}

export function camAt(tl: Timeline, t: number, uid: string) {
  let found: PackedCam | undefined;
  for (const c of tl.cams) {
    if (c.t > t) break;
    if (c.uid === uid) found = c;
  }
  return found ?? { t: 0, uid, z: 1, x: 0, y: 0 };
}

type Affine = BoardAffine;
const IDENTITY: Affine = { sx: 1, sy: 1, dx: 0, dy: 0, shx: 0, shy: 0, rot: 0, cx: 0, cy: 0 };

function composeAffine(a: Affine, b: Affine): Affine {
  return {
    sx: b.sx * a.sx + b.shx * a.shy,
    shx: b.sx * a.shx + b.shx * a.sy,
    shy: b.shy * a.sx + b.sy * a.shy,
    sy: b.shy * a.shx + b.sy * a.sy,
    dx: b.sx * a.dx + b.shx * a.dy + b.dx,
    dy: b.shy * a.dx + b.sy * a.dy + b.dy,
    rot: a.rot + b.rot,
    cx: b.rot ? b.cx : a.cx,
    cy: b.rot ? b.cy : a.cy,
  };
}

function isIdentity(xf: Affine) {
  return xf.sx === 1 && xf.sy === 1 && xf.dx === 0 && xf.dy === 0 && !xf.shx && !xf.shy && !xf.rot;
}

function applyAffine(pts: number[], xf: Affine) {
  if (isIdentity(xf)) return pts;
  const n = pts.slice();
  for (let i = 0; i < n.length; i += 2) {
    const x = n[i]!;
    const y = n[i + 1]!;
    n[i] = xf.sx * x + xf.shx * y + xf.dx;
    n[i + 1] = xf.shy * x + xf.sy * y + xf.dy;
  }
  if (!xf.rot) return n;
  const rad = (xf.rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (let i = 0; i < n.length; i += 2) {
    const dx = n[i]! - xf.cx;
    const dy = n[i + 1]! - xf.cy;
    n[i] = xf.cx + dx * cos - dy * sin;
    n[i + 1] = xf.cy + dx * sin + dy * cos;
  }
  return n;
}

function forwardPoint(xf: Affine, x: number, y: number): [number, number] {
  let nx = xf.sx * x + xf.shx * y + xf.dx;
  let ny = xf.shy * x + xf.sy * y + xf.dy;
  if (!xf.rot) return [nx, ny];
  const rad = (xf.rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = nx - xf.cx;
  const dy = ny - xf.cy;
  nx = xf.cx + dx * cos - dy * sin;
  ny = xf.cy + dx * sin + dy * cos;
  return [nx, ny];
}

function backwardPoint(xf: Affine, x: number, y: number): [number, number] {
  let nx = x;
  let ny = y;
  if (xf.rot) {
    const rad = (-xf.rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = nx - xf.cx;
    const dy = ny - xf.cy;
    nx = xf.cx + dx * cos - dy * sin;
    ny = xf.cy + dx * sin + dy * cos;
  }
  const det = xf.sx * xf.sy - xf.shx * xf.shy || 1;
  const px = nx - xf.dx;
  const py = ny - xf.dy;
  return [(xf.sy * px - xf.shx * py) / det, (-xf.shy * px + xf.sx * py) / det];
}

/** Move an eraser path by the same change that moved the stroke it cut. */
export function followEraser(points: number[], atErase: BoardAffine, now: BoardAffine): number[] {
  if (points.length < 2) return points;
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const [lx, ly] = backwardPoint(atErase, points[i]!, points[i + 1]!);
    const [x, y] = forwardPoint(now, lx, ly);
    out.push(x, y);
  }
  return out;
}

export function pointsUntil(st: PackedStroke, t: number): number[] {
  if (st.te <= t) return st.p;
  const pts: number[] = [];
  for (let i = 0; i < st.k.length; i++) {
    if (st.k[i]! > t) break;
    pts.push(st.p[i * 2]!, st.p[i * 2 + 1]!);
  }
  return pts;
}

const HIT_WIDTH = 1280;

function halfNorm(size: number, mode: DrawMode) {
  return strokeWidthPx(size, HIT_WIDTH, mode) / HIT_WIDTH / 2;
}

function boundsOf(pts: number[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i]!;
    const y = pts[i + 1]!;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function segDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const ux = bx - ax;
  const uy = by - ay;
  const vx = dx - cx;
  const vy = dy - cy;
  const wx = ax - cx;
  const wy = ay - cy;
  const a = ux * ux + uy * uy;
  const b = ux * vx + uy * vy;
  const c = vx * vx + vy * vy;
  const d = ux * wx + uy * wy;
  const e = vx * wx + vy * wy;
  const D = a * c - b * b;
  let sN: number;
  let sD = D;
  let tN: number;
  let tD = D;
  if (D < 1e-12) {
    sN = 0;
    sD = 1;
    tN = e;
    tD = c;
  } else {
    sN = b * e - c * d;
    tN = a * e - b * d;
    if (sN < 0) {
      sN = 0;
      tN = e;
      tD = c;
    } else if (sN > sD) {
      sN = sD;
      tN = e + b;
      tD = c;
    }
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0;
    else if (-d > a) sN = sD;
    else {
      sN = -d;
      sD = a;
    }
  } else if (tN > tD) {
    tN = tD;
    if (-d + b < 0) sN = 0;
    else if (-d + b > a) sN = sD;
    else {
      sN = -d + b;
      sD = a;
    }
  }
  const sc = Math.abs(sN) < 1e-12 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-12 ? 0 : tN / tD;
  const ex = wx + sc * ux - tc * vx;
  const ey = wy + sc * uy - tc * vy;
  return Math.hypot(ex, ey);
}

function polylinesHit(a: number[], b: number[], limit: number) {
  const ia = Math.max(1, Math.ceil((a.length / 2 - 1) / 80));
  const ib = Math.max(1, Math.ceil((b.length / 2 - 1) / 80));
  for (let i = 0; i + 3 < a.length; i += 2 * ia) {
    const ax = a[i]!;
    const ay = a[i + 1]!;
    const bx = a[Math.min(i + 2 * ia, a.length - 2)]!;
    const by = a[Math.min(i + 2 * ia + 1, a.length - 1)]!;
    for (let j = 0; j + 3 < b.length; j += 2 * ib) {
      const d = segDist(ax, ay, bx, by, b[j]!, b[j + 1]!, b[Math.min(j + 2 * ib, b.length - 2)]!, b[Math.min(j + 2 * ib + 1, b.length - 1)]!);
      if (d <= limit) return true;
    }
  }
  return false;
}

function bindErasers(tl: Timeline): EraserHit[] {
  const erasers = tl.strokes.filter((st) => st.m === "eraser" && st.p.length >= 2);
  if (!erasers.length) return [];
  const ink = new Map<string, PackedStroke[]>();
  for (const st of tl.strokes) {
    if (st.m === "eraser") continue;
    const list = ink.get(st.uid);
    if (list) list.push(st);
    else ink.set(st.uid, [st]);
  }
  // Walk the shifts once in time order instead of rebuilding them per eraser.
  const order = erasers.map((_, i) => i).sort((a, b) => erasers[a]!.te - erasers[b]!.te);
  const found: EraserHit[][] = new Array(erasers.length);
  const xforms = new Map<string, Affine>();
  let si = 0;
  for (const idx of order) {
    const er = erasers[idx]!;
    while (si < tl.shifts.length && tl.shifts[si]!.t <= er.te) applyShift(xforms, tl.shifts[si]!), si++;
    const out: EraserHit[] = [];
    found[idx] = out;
    const ePts = pointsUntil(er, er.te);
    const eHalf = halfNorm(er.w, "eraser");
    const box = boundsOf(ePts);
    const pad = eHalf + 0.02;
    for (const st of ink.get(er.uid) ?? []) {
      if (st.t >= er.te || st.p.length < 2) continue;
      const at = xforms.get(st.oid) ?? IDENTITY;
      const pts = applyAffine(pointsUntil(st, er.te), at);
      const sb = boundsOf(pts);
      const limit = eHalf + halfNorm(st.w, st.m);
      if (sb.x1 < box.x0 - pad || sb.x0 > box.x1 + pad || sb.y1 < box.y0 - pad || sb.y0 > box.y1 + pad) continue;
      if (!polylinesHit(ePts, pts, limit)) continue;
      out.push({ eraser: er.oid, oid: st.oid, at: { ...at } });
    }
  }
  const hits: EraserHit[] = [];
  for (const list of found) for (const h of list) hits.push(h);
  return hits;
}

/** Hits for this timeline. Older bundles get them on first use. */
export function eraserHits(tl: Timeline): EraserHit[] {
  if (tl.eraserHits) return tl.eraserHits;
  tl.eraserHits = bindErasers(tl);
  return tl.eraserHits;
}

export function affineAt(tl: Timeline, t: number, oid: string): BoardAffine {
  return xformsAt(tl, t).get(oid) ?? IDENTITY;
}

function applyShift(out: Map<string, Affine>, sh: PackedShift) {
  const next: Affine = {
    sx: sh.sx ?? 1,
    sy: sh.sy ?? 1,
    dx: sh.dx,
    dy: sh.dy,
    shx: sh.shx ?? 0,
    shy: sh.shy ?? 0,
    rot: sh.rot ?? 0,
    cx: sh.cx ?? 0,
    cy: sh.cy ?? 0,
  };
  // A 1.0 sample is a frame where the fingers did not move. It is not a
  // reset, and it is not the size of the whole gesture.
  if (isIdentity(next)) return;
  for (const oid of sh.oids) out.set(oid, composeAffine(out.get(oid) ?? IDENTITY, next));
}

function xformsAt(tl: Timeline, t: number) {
  const out = new Map<string, Affine>();
  for (const sh of tl.shifts) {
    if (sh.t > t) break;
    applyShift(out, sh);
  }
  return out;
}

export function visibleStrokes(tl: Timeline, t: number, uid: string): PackedStroke[] {
  const killed = new Set<string>();
  for (const er of tl.erases) {
    if (er.t > t || er.uid !== uid) continue;
    if (er.kind === "all") {
      for (const st of tl.strokes) if (st.uid === uid && st.t < er.t) killed.add(st.oid);
    } else if (er.kind === "undo") {
      let last: PackedStroke | undefined;
      for (const st of tl.strokes) {
        if (st.uid === uid && st.t < er.t && !killed.has(st.oid)) last = st;
      }
      if (last) killed.add(last.oid);
    } else if (er.oids) {
      for (const id of er.oids) killed.add(id);
    }
  }
  const xforms = xformsAt(tl, t);
  const out: PackedStroke[] = [];
  for (const st of tl.strokes) {
    if (st.uid !== uid || st.t > t || killed.has(st.oid)) continue;
    if (st.m === "highlighter") {
      if (t >= (st.tx ?? st.te + HIGHLIGHTER_HOLD_MS) + HIGHLIGHTER_FADE_MS) continue;
    }
    const xf = xforms.get(st.oid) ?? IDENTITY;
    if (st.te <= t) {
      out.push(isIdentity(xf) ? st : { ...st, p: applyAffine(st.p, xf) });
      continue;
    }
    const pts: number[] = [];
    for (let i = 0; i < st.k.length; i++) {
      if (st.k[i]! > t) break;
      pts.push(st.p[i * 2]!, st.p[i * 2 + 1]!);
    }
    if (pts.length >= 2) out.push({ ...st, p: applyAffine(pts, xf), te: t });
  }
  return out;
}

export function visibleImages(tl: Timeline, t: number, uid: string): PackedImage[] {
  const killed = new Set<string>();
  for (const er of tl.erases) {
    if (er.t > t || er.uid !== uid) continue;
    if (er.kind === "all") {
      for (const im of tl.images) if (im.uid === uid && im.t < er.t) killed.add(im.oid);
    } else if (er.oids) {
      for (const id of er.oids) killed.add(id);
    }
  }
  const xforms = xformsAt(tl, t);
  const out: PackedImage[] = [];
  for (const im of tl.images) {
    if (im.uid !== uid || im.t > t || killed.has(im.oid)) continue;
    const xf = xforms.get(im.oid) ?? IDENTITY;
    if (isIdentity(xf)) {
      out.push(im);
      continue;
    }
    const pts = applyAffine([im.x0, im.y0, im.x1, im.y1], xf);
    out.push({ ...im, x0: pts[0]!, y0: pts[1]!, x1: pts[2]!, y1: pts[3]! });
  }
  return out;
}

export function strokeWidthPx(size: number, canvasW: number, mode: DrawMode) {
  const scale = canvasW / BASE_WIDTH;
  const markerSize = mode === "marker_highlighter" ? Math.min(Math.max(size, 1.2), 2.4) : size;
  const raw = markerSize * scale;
  if (mode === "eraser") return Math.max(14, Math.min(raw * 1.15, canvasW * 0.045));
  if (mode === "marker_highlighter") return Math.max(8, Math.min(raw * 2.2, canvasW * 0.02));
  if (mode === "highlighter") return Math.max(6, Math.min(raw * 1.35, canvasW * 0.016));
  // Unacademy marker on a ~1280 board is a thin felt tip, not a blob.
  return Math.max(0.9, Math.min(raw, canvasW * 0.0048));
}

export function highlighterColor(c: string, alpha = 0.45) {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = c.length >= 7 && c.startsWith("#") ? c.slice(0, 7) : c;
  if (hex.length === 7 && hex.startsWith("#")) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return `rgba(${r},${g},${b},${a})`;
  }
  return c;
}

export function highlighterAlpha(st: PackedStroke, t: number) {
  const base = st.m === "marker_highlighter" ? 0.42 : 0.5;
  if (st.m !== "highlighter") return base;
  const until = st.tx ?? st.te + HIGHLIGHTER_HOLD_MS;
  if (t <= until) return base;
  const k = 1 - (t - until) / HIGHLIGHTER_FADE_MS;
  return Math.max(0, base * k);
}

export function firstInkSec(tl: Timeline) {
  let earliest = Number.POSITIVE_INFINITY;
  for (const st of tl.strokes) {
    if (st.t > 0 && st.t < earliest) earliest = st.t;
  }
  if (!Number.isFinite(earliest) || earliest < 4_000) return 0;
  return earliest / 1000;
}

export function pendingTimeline(id: string, title: string): Timeline {
  return {
    id,
    durationMs: 0,
    videoUrl: "",
    title,
    kind: "video",
    slides: [newBlank(0)],
    switches: [{ t: 0, uid: "blank" }],
    cams: [{ t: 0, uid: "blank", z: 1, x: 0, y: 0 }],
    strokes: [],
    erases: [],
    shifts: [],
    images: [],
  };
}

export function notesSlug(title: string) {
  return title
    .replace(/['’,:()\-–—]/g, "")
    .replace(/&/g, "")
    .replace(/ /g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
}
