import { defineService } from "../lib/server-fn.ts";
import { compactEvents, notesSlug, type Timeline } from "@inkboard/shared/dcn";
import { COPY } from "@inkboard/shared/copy";
import {
  GZIP_MAX_OUTPUT,
  LruMap,
  fetchAllowlisted,
  gunzipCapped,
  isCdnArchive,
  isGzip,
  isHttpsCdn,
} from "@inkboard/shared/cdn-proxy";

import { probeGet, probeSet } from "../repositories/postgres/cache.ts";
import { shapesFor } from "../lib/shape-geom.ts";
import { isPackedTimeline, readTimelineCache, timelineCacheKey, writeTimelineCache } from "../lib/timeline-cache.ts";
import { fetchWithRetry } from "@inkboard/shared/fetch-retry";
import { transportFault, upstreamBad, upstreamNotFound } from "@inkboard/shared/http-error";
import { familyBreaker } from "../lib/breaker.ts";

const cache = new LruMap<Timeline>(80);
const CACHE_VER = "v22";
const mediaCache = new LruMap<{ at: number; archived: boolean }>(400);
const MEDIA_TTL = 6 * 60 * 60 * 1000;

const CDN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://unacademy.com",
  Referer: "https://unacademy.com/",
  Accept: "application/json,application/octet-stream,*/*",
};

export const ARCHIVED_MSG =
  "ARCHIVED: Unacademy moved this recording to cold storage. The video cannot be streamed until they restore it.";

export function isArchivedLessonError(err: unknown) {
  const m = err instanceof Error ? err.message : String(err ?? "");
  return m.includes("ARCHIVED") || m.includes("cold storage");
}

const packing = new Map<string, Promise<Timeline>>();

export function shareJob<T>(map: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  const hit = map.get(key);
  if (hit) return hit;
  const job = run().finally(() => {
    if (map.get(key) === job) map.delete(key);
  });
  map.set(key, job);
  return job;
}

export function timelineFresh(stored: string | undefined, live: string): boolean {
  if (!live || live === "nov") return true;
  return stored === live;
}

async function fetchCdn(url: string, init: RequestInit = {}) {
  return familyBreaker("cdn").run(async () => {
    try {
      return await fetchWithRetry(url, {
        allowed: isHttpsCdn,
        signal: init.signal ?? AbortSignal.timeout(20_000),
        retries: 2,
        timeoutMs: 12_000,
        ...init,
        headers: { ...CDN_HEADERS, ...(init.headers as Record<string, string> | undefined) },
      });
    } catch (err) {
      const mapped = transportFault(err);
      if (mapped) throw mapped;
      throw err;
    }
  });
}

async function loadNotesBytes(id: string): Promise<Uint8Array> {
  const urls = [
    `https://player.uacdn.net/lesson-raw/${id}/data.json`,
    `https://uamedia.uacdn.net/lesson-raw/${id}/data.json`,
  ];
  let archived = false;
  let missing = 0;
  for (const url of urls) {
    const res = await fetchCdn(url);
    if (isCdnArchive(res.headers)) archived = true;
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    if (res.status === 403 || res.status === 404) missing += 1;
    try {
      await res.body?.cancel();
    } catch {
      /* closed */
    }
  }
  if (!archived) {
    try {
      const head = await fetchCdn(urls[0]!, { method: "HEAD" });
      if (isCdnArchive(head.headers)) archived = true;
    } catch {
      /* ignore — a network blip is not an archive */
    }
  }
  if (archived) throw new Error(ARCHIVED_MSG);
  // Both CDN hosts answer 403/404 for an id that has no recording. That is a
  // missing class, not an outage: say 404 so the player shows "not found"
  // instead of "the server is waking up".
  if (missing === urls.length) throw upstreamNotFound("This class has no recording.");
  throw upstreamBad(502, COPY.notesDidNotLoad);
}

async function notesStamp(id: string): Promise<string> {
  try {
    const res = await fetchCdn(`https://player.uacdn.net/lesson-raw/${id}/data.json`, {
      method: "HEAD",
      signal: AbortSignal.timeout(4_000),
    });
    const etag = res.headers.get("etag") ?? "";
    const len = res.headers.get("content-length") ?? "";
    const lm = res.headers.get("last-modified") ?? "";
    try {
      await res.body?.cancel();
    } catch {
      /* closed */
    }
    return [etag, len, lm].filter(Boolean).join(".") || "nov";
  } catch {
    return "nov";
  }
}

export const loadLessonTimeline = defineService({ method: "POST" })
  .validator((d: unknown) => {
    const rec = d as { id?: unknown } | null;
    if (!rec || typeof rec.id !== "string") throw new Error("Lesson id required");
    const id = rec.id.trim();
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) throw new Error("Invalid lesson id");
    return { id };
  })
  .handler(async ({ data }): Promise<Timeline> => {
    const stamp = await notesStamp(data.id);
    const key = timelineCacheKey(CACHE_VER, data.id, "stable");
    const hit = cache.get(key) as (Timeline & { stamp?: string }) | undefined;
    if (hit && hit.id === data.id && timelineFresh(hit.stamp, stamp)) {
      console.info(`[timeline-cache] memory ${data.id}`);
      return hit;
    }
    const saved = await Promise.race([
      readTimelineCache<Timeline & { stamp?: string }>(key),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
    ]);
    if (saved && isPackedTimeline(saved) && saved.id === data.id && timelineFresh(saved.stamp, stamp)) {
      console.info(`[timeline-cache] redis ${data.id} strokes=${saved.strokes.length}`);
      cache.set(key, saved);
      return saved;
    }
    const job = shareJob(packing, data.id, async () => {
      const bytes = await loadNotesBytes(data.id);
      let jsonText: string;
      if (isGzip(bytes)) {
        jsonText = await gunzipCapped(bytes);
      } else {
        if (bytes.length > GZIP_MAX_OUTPUT) throw new Error("Notes too large");
        jsonText = new TextDecoder().decode(bytes);
      }
      const parsed = JSON.parse(jsonText) as unknown;
      if (!Array.isArray(parsed)) throw new Error("Unexpected notes format");
      const tl = compactEvents(data.id, parsed as Parameters<typeof compactEvents>[1], { shapes: await shapesFor(parsed) });
      const stored = Object.assign(tl, { stamp });
      cache.set(key, stored);
      console.info(`[timeline-cache] packed ${data.id} strokes=${tl.strokes.length}`);
      void writeTimelineCache(key, stored).catch((err) => {
        console.warn("[timeline-cache] write failed", err instanceof Error ? err.message : err);
      });
      return tl;
    });
    return job;
  });

async function pdfExists(url: string): Promise<boolean> {
  try {
    const res = await fetchAllowlisted(url, {
      allowed: isHttpsCdn,
      method: "GET",
      headers: { ...CDN_HEADERS, Range: "bytes=0-7" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {
        /* closed */
      }
      return false;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  } catch {
    return false;
  }
}

export type NotesHit = { url: string; filename: string; kind: "notes" | "slides" };

export const resolveLessonNotes = defineService({ method: "POST" })
  .validator((d: unknown) => {
    const rec = d as { id?: unknown; title?: unknown } | null;
    const id = typeof rec?.id === "string" ? rec.id.trim() : "";
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) throw new Error("Invalid lesson id");
    const title = typeof rec?.title === "string" ? rec.title.trim().slice(0, 180) : "";
    return { id, title };
  })
  .handler(async ({ data }): Promise<NotesHit | null> => {
    const slug = data.title ? notesSlug(data.title) : "";
    const candidates: Array<{ url: string; filename: string; kind: "notes" | "slides" }> = [];
    if (slug) {
      candidates.push({
        url: `https://player.uacdn.net/slides_pdf/${data.id}/${slug}_with_anno.pdf`,
        filename: `${slug}_notes.pdf`,
        kind: "notes",
      });
      candidates.push({
        url: `https://player.uacdn.net/slides_pdf/${data.id}/${slug}_no_anno.pdf`,
        filename: `${slug}_slides.pdf`,
        kind: "slides",
      });
    }
    for (const c of candidates) {
      if (await pdfExists(c.url)) return c;
    }
    return null;
  });

export type ReplayMedia = { archived: boolean };

async function headArchived(id: string): Promise<boolean> {
  const now = Date.now();
  const hit = mediaCache.get(id);
  if (hit && now - hit.at < MEDIA_TTL) return hit.archived;
  const stored = await probeGet(id);
  if (stored && now - stored.checkedAt < MEDIA_TTL) {
    mediaCache.set(id, { at: stored.checkedAt, archived: stored.archived });
    return stored.archived;
  }
  try {
    const res = await fetchCdn(`https://player.uacdn.net/lesson-raw/${id}/data.json`, { method: "HEAD" });
    const archived = isCdnArchive(res.headers);
    mediaCache.set(id, { at: now, archived });
    void probeSet(id, archived).catch((err) => {
      console.warn("[media] probe write failed", id, err instanceof Error ? err.message : err);
    });
    return archived;
  } catch {
    return false;
  }
}

export const probeReplayMedia = defineService({ method: "POST" })
  .validator((d: unknown) => {
    const rec = d as { ids?: unknown } | null;
    const ids = [
      ...new Set(
        (Array.isArray(rec?.ids) ? rec.ids : [])
          .map((v) => String(v).trim())
          .filter((id) => /^[A-Za-z0-9_-]{6,40}$/.test(id)),
      ),
    ].slice(0, 80);
    return { ids };
  })
  .handler(async ({ data }): Promise<Record<string, ReplayMedia>> => {
    const out: Record<string, ReplayMedia> = {};
    const pending = data.ids.filter((id) => {
      const hit = mediaCache.get(id);
      if (hit && Date.now() - hit.at < MEDIA_TTL) {
        out[id] = { archived: hit.archived };
        return false;
      }
      return true;
    });
    const chunk = 12;
    for (let i = 0; i < pending.length; i += chunk) {
      const slice = pending.slice(i, i + chunk);
      const rows = await Promise.all(slice.map(async (id) => [id, await headArchived(id)] as const));
      for (const [id, archived] of rows) out[id] = { archived };
    }
    return out;
  });
