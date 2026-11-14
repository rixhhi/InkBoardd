/**
 * Shape-library pieces (Unacademy "mc" with m="shape") are SVG outlines that the server
 * flattens (backend/src/lib/shape-geom.ts). The live board and the offline fallback parse
 * the ink in the browser, so they ask `/api/board/shape` once per shape and use the
 * result from the next parse on. Until it arrives a shape is drawn as its dragged box.
 */
import { compactEvents, type ShapeGeom, type Timeline } from "./dcn.ts";

type Chunks = Parameters<typeof compactEvents>[1];
type Opts = Parameters<typeof compactEvents>[2];

const known = new Map<string, ShapeGeom>();
const asked = new Set<string>();

function want(chunks: unknown) {
  if (typeof window === "undefined" || typeof fetch !== "function" || !Array.isArray(chunks)) return;
  for (const page of chunks) {
    if (!Array.isArray(page)) continue;
    for (const ev of page) {
      const d = ev && ev.plugin === "dcn" ? ev.data : null;
      if (!d || d.e !== "mc" || String(d.m ?? "").toLowerCase().trim() !== "shape" || typeof d.v !== "string") continue;
      if (asked.has(d.v)) continue;
      asked.add(d.v);
      fetch(`/api/board/shape?u=${encodeURIComponent(d.v)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((g: ShapeGeom | null) => {
          if (g && Array.isArray(g.lines)) known.set(d.v, g);
        })
        .catch(() => {
          asked.delete(d.v);
        });
    }
  }
}

export function compactWithShapes(id: string, chunks: Chunks, opts?: Opts): Timeline {
  try {
    want(chunks);
  } catch {
    /* shapes are optional */
  }
  return compactEvents(id, chunks, { ...(opts ?? {}), shapes: opts?.shapes ?? known });
}
