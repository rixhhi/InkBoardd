import {
  affineAt,
  camAt,
  eraserHits,
  followEraser,
  highlighterAlpha,
  highlighterColor,
  pointsUntil,
  slideAt,
  strokeWidthPx,
  visibleImages,
  visibleStrokes,
  type PackedStroke,
  type Timeline,
} from "@inkboard/shared/dcn";

export function applyCam(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  x: number,
  y: number,
  r = 0,
) {
  ctx.translate(w / 2, h / 2);
  ctx.scale(z, z);
  if (r) ctx.rotate((r * Math.PI) / 180);
  ctx.translate(-w / 2 + x * w, -h / 2 + y * h);
}

/** Unacademy liveweb marker path: quadratic through midpoints. */
export function drawPath(ctx: CanvasRenderingContext2D, pts: number[], w: number, h: number, smooth: boolean) {
  const n = pts.length;
  if (n < 2) return;
  if (n < 6) {
    ctx.beginPath();
    ctx.arc(pts[0]! * w, pts[1]! * h, Math.max(0.6, ctx.lineWidth / 2), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0]! * w, pts[1]! * h);
  if (!smooth) {
    for (let i = 2; i < n; i += 2) ctx.lineTo(pts[i]! * w, pts[i + 1]! * h);
    ctx.stroke();
    return;
  }
  for (let i = 2; i < n - 2; i += 2) {
    const mx = ((pts[i]! + pts[i + 2]!) / 2) * w;
    const my = ((pts[i + 1]! + pts[i + 3]!) / 2) * h;
    ctx.quadraticCurveTo(pts[i]! * w, pts[i + 1]! * h, mx, my);
  }
  ctx.lineTo(pts[n - 2]! * w, pts[n - 1]! * h);
  ctx.stroke();
}

export function drawStroke(ctx: CanvasRenderingContext2D, st: PackedStroke, w: number, h: number, timeMs: number) {
  const pts = st.p;
  if (pts.length < 2) return;
  ctx.save();
  const width = strokeWidthPx(st.w, w, st.m);
  const wash = st.m === "highlighter" || st.m === "marker_highlighter";

  if (st.m === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawPath(ctx, pts, w, h, true);
    ctx.restore();
    return;
  }

  ctx.globalCompositeOperation = "source-over";
  const alpha = wash ? highlighterAlpha(st, timeMs) : 1;
  if (alpha <= 0.02) {
    ctx.restore();
    return;
  }
  const color = wash ? highlighterColor(st.c, alpha) : st.c;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (st.m === "rectangle" && pts.length >= 4) {
    ctx.strokeRect(pts[0]! * w, pts[1]! * h, pts[2]! * w - pts[0]! * w, pts[3]! * h - pts[1]! * h);
    ctx.restore();
    return;
  }
  if (st.m === "circle" && pts.length >= 4) {
    const x = pts[0]! * w;
    const y = pts[1]! * h;
    const rw = pts[2]! * w - x;
    const rh = pts[3]! * h - y;
    ctx.beginPath();
    ctx.ellipse(x + rw / 2, y + rh / 2, Math.abs(rw / 2), Math.abs(rh / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if ((st.m === "line" || st.m === "arrow" || st.m === "dashed_line") && pts.length >= 4) {
    const x1 = pts[0]! * w;
    const y1 = pts[1]! * h;
    const x2 = pts[2]! * w;
    const y2 = pts[3]! * h;
    if (st.m === "dashed_line") ctx.setLineDash([Math.max(6, width * 3), Math.max(4, width * 2)]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (st.m === "arrow") {
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const r = width * 3;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - r * Math.cos(ang - Math.PI / 4), y2 - r * Math.sin(ang - Math.PI / 4));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - r * Math.cos(ang + Math.PI / 4), y2 - r * Math.sin(ang + Math.PI / 4));
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  drawPath(ctx, pts, w, h, true);
  ctx.restore();
}

export function slideFill(slide: { url?: string; bc: string }, hasImage = false) {
  if (!hasImage) return "#202022";
  if (slide.bc && slide.bc !== "#202022") return slide.bc;
  if (slide.url) return "#f4f6f8";
  return "#202022";
}

/** Keep the last ready slide on screen until the next URL has actually loaded.
 *  A blank canvas (no URL) must not keep the previous JPEG/PDF — that's the
 *  cover-slide-stuck-under-new-ink bug. */
export function heldSlideImage<T>(opts: {
  currentUrl?: string;
  loadedUrl?: string;
  loaded: T | null;
  sticky: T | null;
}): T | null {
  if (!opts.currentUrl) return null;
  if (opts.currentUrl === opts.loadedUrl && opts.loaded) return opts.loaded;
  return opts.sticky;
}

/** Never drop a loaded live raster because a refresh 404'd. */
export function keepLiveRaster<T>(prev: T | null, next: T | null): T | null {
  return next ?? prev;
}

/** Don't replace a decoded page with an empty/tiny decode (title-card flash). */
export function shouldSwapLiveBitmap(opts: {
  prev?: { naturalWidth: number } | null;
  next: { naturalWidth: number };
}) {
  if (!opts.next.naturalWidth) return false;
  if (opts.next.naturalWidth < 64) return false;
  if (!opts.prev?.naturalWidth) return true;
  return true;
}


/** Setting canvas.width clears pixels — skip when the size did not change. */
export function canvasNeedsResize(canvas: { width: number; height: number }, w: number, h: number) {
  return canvas.width !== w || canvas.height !== h;
}

/** Fill the 16:9 board (Unacademy stretches the raster; ink is 0–1 of that board). */
export function drawFilled(
  ctx: CanvasRenderingContext2D,
  img: { naturalWidth: number; naturalHeight?: number; width?: number; height?: number },
  w: number,
  h: number,
) {
  if (!img.naturalWidth && !img.width) return;
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
}

/** @deprecated ink is in board space — use drawFilled so notes and writing share one rectangle. */
export function drawContained(
  ctx: CanvasRenderingContext2D,
  img: { naturalWidth: number; naturalHeight?: number; width?: number; height?: number },
  w: number,
  h: number,
) {
  drawFilled(ctx, img, w, h);
}

const inkLayers = new WeakMap<object, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>();

/** One reusable layer per board, so a moved stroke can keep the hole that was cut into it. */
function inkLayer(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
  const host = (ctx as CanvasRenderingContext2D & { canvas?: HTMLCanvasElement }).canvas;
  const doc = host?.ownerDocument;
  if (!host || !doc?.createElement) return null;
  let box = inkLayers.get(host);
  if (!box) {
    const canvas = doc.createElement("canvas");
    const sctx = canvas.getContext("2d");
    if (!sctx) return null;
    box = { canvas, ctx: sctx };
    inkLayers.set(host, box);
  }
  const sw = Math.max(1, Math.round(w * dpr));
  const sh = Math.max(1, Math.round(h * dpr));
  if (box.canvas.width !== sw || box.canvas.height !== sh) {
    box.canvas.width = sw;
    box.canvas.height = sh;
  }
  return box;
}

export function paintSlideCtx(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tl: Timeline,
  timeMs: number,
  slideImg: { naturalWidth: number } | null,
  drawImage?: (img: { naturalWidth: number }, dw: number, dh: number) => void,
  dpr = 1,
) {
  const slide = slideAt(tl, timeMs);
  const cam = camAt(tl, timeMs, slide.uid);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = slideFill(slide, Boolean(slideImg?.naturalWidth));
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  const z = cam.z || 1;
  applyCam(ctx, w, h, z, cam.x, cam.y, cam.r);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();

  if (slideImg?.naturalWidth) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (drawImage) drawImage(slideImg, w, h);
    else drawFilled(ctx, slideImg, w, h);
  }
  ctx.restore();
}

export function paintInkCtx(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tl: Timeline,
  timeMs: number,
  dpr = 1,
  bitmaps?: Map<string, CanvasImageSource & { naturalWidth: number }>,
) {
  const slide = slideAt(tl, timeMs);
  const cam = camAt(tl, timeMs, slide.uid);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  const z = cam.z || 1;
  applyCam(ctx, w, h, z, cam.x, cam.y, cam.r);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();

  for (const im of visibleImages(tl, timeMs, slide.uid)) {
    const bmp = bitmaps?.get(im.url);
    const x = im.x0 * w;
    const y = im.y0 * h;
    const dw = (im.x1 - im.x0) * w;
    const dh = (im.y1 - im.y0) * h;
    if (bmp?.naturalWidth) ctx.drawImage(bmp, x, y, dw, dh);
    else {
      ctx.fillStyle = "rgba(230,225,214,0.18)";
      ctx.fillRect(x, y, dw, dh);
    }
  }

  const strokes = visibleStrokes(tl, timeMs, slide.uid);
  const ink = strokes.filter((st) => st.m !== "highlighter" && st.m !== "eraser");
  const wash = strokes.filter((st) => st.m === "highlighter");
  const bound = new Map<string, ReturnType<typeof eraserHits>>();
  for (const hit of eraserHits(tl)) {
    const list = bound.get(hit.oid);
    if (list) list.push(hit);
    else bound.set(hit.oid, [hit]);
  }
  const erasers = new Map<string, PackedStroke>();
  for (const st of tl.strokes) if (st.m === "eraser") erasers.set(st.oid, st);
  const paintOne = (st: PackedStroke) => {
    const hits = (bound.get(st.oid) ?? []).filter((hit) => {
      const er = erasers.get(hit.eraser);
      return Boolean(er && er.t <= timeMs);
    });
    if (!hits.length) {
      drawStroke(ctx, st, w, h, timeMs);
      return;
    }
    const layer = inkLayer(ctx, w, h, dpr);
    if (!layer) {
      drawStroke(ctx, st, w, h, timeMs);
      return;
    }
    const sctx = layer.ctx;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, w, h);
    sctx.save();
    applyCam(sctx, w, h, z, cam.x, cam.y, cam.r);
    sctx.beginPath();
    sctx.rect(0, 0, w, h);
    sctx.clip();
    drawStroke(sctx, st, w, h, timeMs);
    const now = affineAt(tl, timeMs, st.oid);
    for (const hit of hits) {
      const er = erasers.get(hit.eraser);
      if (!er) continue;
      const pts = pointsUntil(er, timeMs);
      if (pts.length < 2) continue;
      drawStroke(sctx, { ...er, p: followEraser(pts, hit.at, now) }, w, h, timeMs);
    }
    sctx.restore();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
  };
  for (const st of ink) paintOne(st);
  for (const st of wash) paintOne(st);
  ctx.restore();
}

export function fit16x9(cw: number, ch: number) {
  if (cw <= 0 || ch <= 0) return { w: 320, h: 180 };
  if (cw / ch > 16 / 9) {
    const h = ch;
    return { w: Math.round((16 / 9) * h), h: Math.round(h) };
  }
  const w = cw;
  return { w: Math.round(w), h: Math.round((9 / 16) * w) };
}

function canvasCssSize(canvas: HTMLCanvasElement) {
  const cssW = Number.parseFloat(canvas.style.width) || canvas.clientWidth || canvas.width;
  const cssH = Number.parseFloat(canvas.style.height) || canvas.clientHeight || canvas.height;
  const dpr = cssW > 0 ? canvas.width / cssW : 1;
  return { w: cssW, h: cssH, dpr: Number.isFinite(dpr) && dpr > 0 ? dpr : 1 };
}

export function paintSlide(
  canvas: HTMLCanvasElement,
  tl: Timeline,
  timeMs: number,
  slideImg: HTMLImageElement | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { w, h, dpr } = canvasCssSize(canvas);
  paintSlideCtx(ctx, w, h, tl, timeMs, slideImg, undefined, dpr);
}

export function paintInk(
  canvas: HTMLCanvasElement,
  tl: Timeline,
  timeMs: number,
  bitmaps?: Map<string, CanvasImageSource & { naturalWidth: number }>,
) {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  const { w, h, dpr } = canvasCssSize(canvas);
  paintInkCtx(ctx, w, h, tl, timeMs, dpr, bitmaps);
}

/**
 * Paint ink for the time on the rail, not the camera's decoded keyframe.
 * A jump sets the board clock immediately; WebM `currentTime` can sit at 0
 * or the previous keyframe until seeked — follow the board clock then.
 */
export function inkPaintMs(opts: {
  mediaSec: number;
  seeking: boolean;
  frozenMs: number | null;
  lastPaintMs: number;
  fallbackMs?: number;
  preferClock?: boolean;
}): { paintMs: number; frozenMs: number | null } {
  const mediaMs =
    Number.isFinite(opts.mediaSec) && opts.mediaSec >= 0 ? opts.mediaSec * 1000 : Number.NaN;
  const board = Number.isFinite(opts.fallbackMs) ? (opts.fallbackMs as number) : Number.NaN;
  if (opts.preferClock && Number.isFinite(board)) {
    return { paintMs: board, frozenMs: null };
  }
  if (opts.seeking && Number.isFinite(board)) {
    return { paintMs: board, frozenMs: null };
  }
  if (Number.isFinite(mediaMs)) return { paintMs: mediaMs, frozenMs: null };
  if (Number.isFinite(board)) return { paintMs: board, frozenMs: null };
  if (opts.lastPaintMs >= 0) return { paintMs: opts.lastPaintMs, frozenMs: opts.frozenMs };
  return { paintMs: 0, frozenMs: null };
}

