/** Allowlisted CDN fetches: hop-checked redirects, size caps, rate limits. */

import { isPrivateAddress, rejectReboundHost } from "./ssrf.ts";

export const SLIDE_HOSTS = new Set([
  "uadoc.uacdn.net",
  "static.uacdn.net",
  "player.uacdn.net",
  "uamedia.uacdn.net",
  "edge.uacdn.net",
]);

export const MAX_REDIRECTS = 3;
export const SLIDE_MAX_BYTES = 8 * 1024 * 1024;
export const NOTES_MAX_BYTES = 25 * 1024 * 1024;
export const NOTES_TITLE_MAX = 120;
export const GZIP_MAX_COMPRESSED = 32 * 1024 * 1024;
export const GZIP_MAX_OUTPUT = 128 * 1024 * 1024;
export const PROXY_RATE_LIMIT = 60;
export const PROXY_RATE_WINDOW_MS = 60_000;
export const PROXY_MAX_INFLIGHT = 8;

export type AllowFn = (url: URL) => boolean;

export function isHttpsCdn(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  return url.hostname === "uacdn.net" || url.hostname.endsWith(".uacdn.net");
}

export function isUnacademyHost(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const h = url.hostname;
  return (
    h === "unacademy.com" ||
    h.endsWith(".unacademy.com") ||
    h === "uacdn.net" ||
    h.endsWith(".uacdn.net")
  );
}

export function isSlideUrl(url: URL): boolean {
  if (!isHttpsCdn(url)) return false;
  return SLIDE_HOSTS.has(url.hostname) || url.hostname.endsWith(".uacdn.net");
}

/** Notes must be a PDF on the CDN, with `/dpp` / `/slides_pdf` / `/lesson-raw` as a path segment. */
export function isNotesUrl(url: URL): boolean {
  if (!isHttpsCdn(url)) return false;
  const path = url.pathname.toLowerCase();
  if (!path.endsWith(".pdf")) return false;
  const parts = path.split("/").filter(Boolean);
  return parts.some((p) => p === "dpp" || p === "slides_pdf" || p === "lesson-raw");
}

export function isWebp(buf: Uint8Array): boolean {
  return (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  );
}

export function isJpeg(buf: Uint8Array): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

export function isPng(buf: Uint8Array): boolean {
  return buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

export function isPdfMagic(buf: Uint8Array): boolean {
  return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Unacademy's image gateway only rasterizes a PDF when `page` is present. */
export function ensurePdfPage(url: URL, page = "1"): URL {
  const path = url.pathname.toLowerCase();
  if (!path.endsWith(".pdf")) return url;
  if (url.searchParams.get("page")) return url;
  const next = new URL(url);
  next.searchParams.set("page", page);
  return next;
}

export function rasterKind(
  buf: Uint8Array,
  hinted = "",
): "jpeg" | "png" | "webp" | "pdf" | "image" | "unknown" {
  if (isJpeg(buf)) return "jpeg";
  if (isPng(buf)) return "png";
  if (isWebp(buf)) return "webp";
  if (isPdfMagic(buf)) return "pdf";
  const type = hinted.split(";")[0]!.trim().toLowerCase();
  if (type === "application/pdf" || type === "application/x-pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  return "unknown";
}

export function rasterContentType(kind: ReturnType<typeof rasterKind>, hinted = ""): string {
  if (kind === "jpeg") return "image/jpeg";
  if (kind === "png") return "image/png";
  if (kind === "webp") return "image/webp";
  if (kind === "image") {
    const type = hinted.split(";")[0]!.trim().toLowerCase();
    return type.startsWith("image/") ? type : "image/jpeg";
  }
  return "";
}

/** UADoc overwrites the same JPEG as the teacher writes. Bust CDN cache on live fetches. */
export function withLiveCacheBust(url: URL, live = false, now = Date.now()): URL {
  if (!live) return url;
  if (url.hostname !== "uadoc.uacdn.net") return url;
  if (/\/live_class\/background\//i.test(url.pathname)) return url;
  const next = new URL(url);
  if (!next.searchParams.has("t")) next.searchParams.set("t", String(now));
  return next;
}

export function isCdnArchive(headers: Headers): boolean {
  const status = (headers.get("x-amz-archive-status") || "").toLowerCase();
  return status.includes("archive");
}

export function errStatus(err: unknown, fallback = 502): number {
  const s = (err as { status?: number } | null)?.status;
  return typeof s === "number" ? s : fallback;
}

export function fail(message: string, status: number): never {
  const err = new Error(message);
  (err as Error & { status?: number }).status = status;
  throw err;
}

const hits = new Map<string, number[]>();

export function resetProxyLimits() {
  hits.clear();
  inflight = 0;
  waiters.length = 0;
}

export function allowRate(ip: string, limit = PROXY_RATE_LIMIT, windowMs = PROXY_RATE_WINDOW_MS): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 4_000) {
    for (const [key, times] of hits) {
      if (!times.length || now - times[times.length - 1]! > windowMs) hits.delete(key);
    }
  }
  return true;
}

let inflight = 0;
const waiters: Array<() => void> = [];

export async function withUpstreamSlot<T>(fn: () => Promise<T>, max = PROXY_MAX_INFLIGHT): Promise<T> {
  if (inflight >= max) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  inflight += 1;
  try {
    return await fn();
  } finally {
    inflight -= 1;
    waiters.shift()?.();
  }
}

export async function fetchAllowlisted(
  start: string | URL,
  init: RequestInit & { allowed?: AllowFn; maxHops?: number } = {},
): Promise<Response> {
  const allowed = init.allowed ?? isHttpsCdn;
  const maxHops = init.maxHops ?? MAX_REDIRECTS;
  let current = typeof start === "string" ? new URL(start) : new URL(start.toString());
  if (isPrivateAddress(current.hostname) || (current.protocol !== "https:" && current.protocol !== "http:")) {
    fail("Blocked address", 400);
  }
  if (!allowed(current)) fail("Host not allowed", 400);
  const { allowed: _a, maxHops: _h, redirect: _r, ...rest } = init as RequestInit & {
    allowed?: AllowFn;
    maxHops?: number;
  };
  const seen = new Set<string>();

  for (let hop = 0; hop <= maxHops; hop += 1) {
    const key = current.toString();
    if (seen.has(key)) fail("Redirect loop", 400);
    seen.add(key);
    try {
      await rejectReboundHost(current.hostname);
    } catch {
      fail("Blocked address", 400);
    }
    const res = await fetch(current.toString(), { ...rest, redirect: "manual" });
    const status = res.status;
    if (status >= 300 && status < 400) {
      const loc = res.headers.get("location");
      try {
        await res.body?.cancel();
      } catch {
        /* closed */
      }
      if (!loc) fail("Invalid redirect", 400);
      if (hop === maxHops) fail("Too many redirects", 400);
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        fail("Invalid redirect", 400);
      }
      if (isPrivateAddress(next.hostname) || (next.protocol !== "https:" && next.protocol !== "http:")) {
        fail("Blocked address", 400);
      }
      if (!allowed(next)) fail("Redirected off the CDN", 400);
      current = next;
      continue;
    }
    return res;
  }
  fail("Too many redirects", 400);
}

export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) fail("Too large", 413);
    return buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      fail("Too large", 413);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    buf.set(part, offset);
    offset += part.byteLength;
  }
  return buf;
}

export function sanitizeFilename(name: string): string {
  const trimmed = name.replace(/[\r\n\t"]/g, "").trim() || "notes.pdf";
  const base = trimmed.split(/[/\\]/).pop() || "notes.pdf";
  const ascii = base
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "")
    .slice(0, 80);
  const withExt = /\.pdf$/i.test(ascii) ? ascii : `${ascii || "notes"}.pdf`;
  return withExt;
}

export function capTitle(title: string): string {
  return String(title || "")
    .replace(/[\r\n\t]/g, " ")
    .trim()
    .slice(0, NOTES_TITLE_MAX);
}

export function contentDisposition(filename: string, inline = false): string {
  const safe = sanitizeFilename(filename);
  const raw = String(filename || "").replace(/[\r\n]/g, "");
  const encoded = encodeURIComponent(raw);
  const mode = inline ? "inline" : "attachment";
  return `${mode}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export class LruMap<T> {
  private map = new Map<string, T>();
  private max: number;
  constructor(max: number) {
    this.max = max;
  }
  get(key: string): T | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key: string, value: T) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const first = this.map.keys().next().value;
      if (first == null) break;
      this.map.delete(first);
    }
  }
  has(key: string) {
    return this.map.has(key);
  }
}

export async function gunzipCapped(bytes: Uint8Array): Promise<string> {
  if (bytes.length > GZIP_MAX_COMPRESSED) throw new Error("Notes too large");
  const { gunzipSync } = await import("node:zlib");
  const out = gunzipSync(bytes, { maxOutputLength: GZIP_MAX_OUTPUT });
  return new TextDecoder().decode(out);
}

