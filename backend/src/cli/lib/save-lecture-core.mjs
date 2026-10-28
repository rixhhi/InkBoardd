/**
 * Save one Unacademy lecture into an Inkboard bundle folder.
 * Headers match src/lib/lesson-api.ts CDN_HEADERS (copied — that file uses @/ imports).
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { compactEvents, notesSlug, unproxySlideUrl } from "@inkboard/shared/dcn";
import {
  SLIDE_MAX_BYTES,
  NOTES_MAX_BYTES,
  ensurePdfPage,
  isCdnArchive,
  isGzip,
  rasterKind,
} from "@inkboard/shared/cdn-proxy";
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  PARSER_VERSION,
  validateManifest,
} from "@inkboard/shared/bundle/manifest";
import { isSafeFolderName } from "@inkboard/shared/bundle/chapter";

export const EXIT = { ok: 0, error: 1, args: 2, archived: 3, forbidden: 4, limit: 5 };

/** Same as lesson-api.ts CDN_HEADERS. */
export const CDN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://unacademy.com",
  Referer: "https://unacademy.com/",
  Accept: "application/json,application/octet-stream,*/*",
};

const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
const MEDIA_MAX = 2 * 1024 * 1024 * 1024;
/** Long board classes often ship 10–40 MB of ink. The public proxy stays at 8 MB. */
export const INK_MAX_BYTES = 64 * 1024 * 1024;
export const INK_MAX_OUTPUT = 256 * 1024 * 1024;
const SLIDE_CONCURRENCY = 4;
const MEDIA_IDLE_MS = 30_000;
const MEDIA_ATTEMPTS = 5;

export class SaveLectureError extends Error {
  constructor(message, code = EXIT.error, extra = {}) {
    super(message);
    this.name = "SaveLectureError";
    this.code = code;
    this.aborted = Boolean(extra.aborted);
  }
}

export function isStoppedError(err) {
  return Boolean(err && (err.aborted || (err instanceof SaveLectureError && err.message === "Stopped")));
}

export function sha256Buf(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Chunked, so a 2 GB recording never has to fit in memory. */
export function sha256File(path) {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      hash.update(buf.subarray(0, n));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

export function gzipInk(bytes) {
  if (isGzip(bytes)) return bytes;
  return gzipSync(bytes);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new SaveLectureError("Stopped", EXIT.error, { aborted: true });
}

function asAbortError(err) {
  const name = err && typeof err === "object" ? err.name : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return new SaveLectureError("Stopped", EXIT.error, { aborted: true });
  }
  return err;
}

function mergeSignal(timeoutMs, user) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onUser = () => ctrl.abort();
  if (user) {
    if (user.aborted) ctrl.abort();
    else user.addEventListener("abort", onUser, { once: true });
  }
  return {
    signal: ctrl.signal,
    dispose() {
      clearTimeout(timer);
      user?.removeEventListener?.("abort", onUser);
    },
  };
}

function sleep(ms, signal) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new SaveLectureError("Stopped", EXIT.error, { aborted: true }));
    }
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new SaveLectureError("Stopped", EXIT.error, { aborted: true }));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function backoff(attempt) {
  return Math.min(4_000, 280 * 2 ** attempt + Math.round(Math.random() * 120));
}

function defaultLog() {
  return {
    info: (m) => console.error(m),
    warn: (m) => console.error(m),
    error: (m) => console.error(m),
    progress: (m) => {
      process.stderr.write(`\r${m}`);
    },
    newline: () => process.stderr.write("\n"),
  };
}

async function fetchOnce(fetchImpl, url, init, _log) {
  const allowForbidden = init?.allowForbidden === true;
  const { allowForbidden: _drop, timeoutMs: _t, ...fetchInit } = init || {};
  const res = await fetchImpl(url, fetchInit);
  if (isCdnArchive(res.headers)) {
    try {
      await res.body?.cancel();
    } catch {
      /* closed */
    }
    throw new SaveLectureError("ARCHIVED, cannot be saved", EXIT.archived);
  }
  if (res.status === 403 || res.status === 429) {
    if (allowForbidden) return res;
    try {
      await res.body?.cancel();
    } catch {
      /* closed */
    }
    throw new SaveLectureError(
      res.status === 429 ? "Rate limited (429). Stopped." : "Forbidden (403). Stopped.",
      EXIT.forbidden,
    );
  }
  return res;
}

async function fetchRetry(fetchImpl, url, init, log, retries = 2) {
  let last;
  const userSignal = init?.signal;
  for (let attempt = 0; attempt <= retries; attempt++) {
    throwIfAborted(userSignal);
    try {
      const merged = mergeSignal(init?.timeoutMs ?? 20_000, userSignal);
      try {
        const res = await fetchOnce(fetchImpl, url, { ...init, signal: merged.signal }, log);
        if (res.ok || res.status === 206 || res.status === 416) return res;
        if (res.status === 404 || res.status === 410) return res;
        if (init?.allowForbidden && (res.status === 403 || res.status === 429)) return res;
        last = new SaveLectureError(`HTTP ${res.status} for ${url}`, EXIT.error);
        try {
          await res.body?.cancel();
        } catch {
          /* closed */
        }
      } finally {
        merged.dispose();
      }
    } catch (err) {
      const mapped = asAbortError(err);
      if (mapped instanceof SaveLectureError && mapped.aborted) throw mapped;
      if (err instanceof SaveLectureError) throw err;
      last = mapped;
    }
    if (attempt < retries) await sleep(backoff(attempt), userSignal);
  }
  throw last instanceof Error ? last : new SaveLectureError(String(last), EXIT.error);
}

async function readCapped(res, maxBytes, label = "File") {
  const capMb = Math.round(maxBytes / (1024 * 1024));
  const tooBig = () => new SaveLectureError(`${label} too large (over ${capMb} MB)`, EXIT.error);
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw tooBig();
    return buf;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooBig();
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

function decodeInk(rawInk) {
  if (!isGzip(rawInk)) {
    if (rawInk.byteLength > INK_MAX_OUTPUT) {
      throw new SaveLectureError(`Ink log too large (over ${INK_MAX_OUTPUT / (1024 * 1024)} MB)`, EXIT.error);
    }
    return new TextDecoder().decode(rawInk);
  }
  if (rawInk.byteLength > INK_MAX_BYTES) {
    throw new SaveLectureError(`Ink log too large (over ${INK_MAX_BYTES / (1024 * 1024)} MB gzipped)`, EXIT.error);
  }
  try {
    const out = gunzipSync(rawInk, { maxOutputLength: INK_MAX_OUTPUT });
    return new TextDecoder().decode(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/exceed|too large|maxOutput/i.test(msg)) {
      throw new SaveLectureError(
        `Ink log too large after decompress (over ${INK_MAX_OUTPUT / (1024 * 1024)} MB)`,
        EXIT.error,
      );
    }
    throw err;
  }
}

function extForKind(kind) {
  if (kind === "jpeg") return "jpg";
  if (kind === "png") return "png";
  if (kind === "webp") return "webp";
  return null;
}

async function poolMap(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: items.length ? n : 0 }, worker));
  return out;
}

async function fetchInk(id, fetchImpl, log, signal) {
  const urls = [
    `https://player.uacdn.net/lesson-raw/${id}/data.json`,
    `https://uamedia.uacdn.net/lesson-raw/${id}/data.json`,
  ];
  let last;
  for (const url of urls) {
    throwIfAborted(signal);
    try {
      const res = await fetchRetry(fetchImpl, url, { headers: CDN_HEADERS, timeoutMs: 20_000, signal }, log);
      if (!res.ok) {
        last = new SaveLectureError(`Ink HTTP ${res.status}`, EXIT.error);
        try {
          await res.body?.cancel();
        } catch {
          /* closed */
        }
        continue;
      }
      const bytes = await readCapped(res, INK_MAX_BYTES, "Ink log");
      return bytes;
    } catch (err) {
      const mapped = asAbortError(err);
      if (mapped instanceof SaveLectureError && (mapped.aborted || mapped.code === EXIT.archived || mapped.code === EXIT.forbidden)) throw mapped;
      last = mapped;
    }
  }
  throw last instanceof Error ? last : new SaveLectureError("Ink did not load", EXIT.error);
}

async function downloadMedia(url, dest, fetchImpl, log, signal) {
  mkdirSync(dirname(dest), { recursive: true });
  throwIfAborted(signal);
  let offset = existsSync(dest) ? statSync(dest).size : 0;
  const headers = { ...CDN_HEADERS };
  if (offset > 0) headers.Range = `bytes=${offset}-`;
  const res = await fetchRetry(fetchImpl, url, { headers, timeoutMs: 60_000, signal }, log);
  if (res.status === 416) {
    try {
      await res.body?.cancel();
    } catch {
      /* closed */
    }
    return offset;
  }
  if (res.status === 200 && offset > 0) {
    offset = 0;
  } else if (res.status !== 200 && res.status !== 206) {
    try {
      await res.body?.cancel();
    } catch {
      /* closed */
    }
    throw new SaveLectureError(`Media HTTP ${res.status}`, EXIT.error);
  }
  const totalHeader = res.headers.get("content-length");
  const incoming = totalHeader ? Number(totalHeader) : NaN;
  const knownTotal = Number.isFinite(incoming)
    ? res.status === 206
      ? offset + incoming
      : incoming
    : NaN;
  const fh = createWriteStream(dest, { flags: offset > 0 ? "a" : "w" });
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    fh.write(buf);
    await new Promise((resolve, reject) => {
      fh.end((err) => (err ? reject(err) : resolve()));
    });
    const total = offset + buf.byteLength;
    if (Number.isFinite(knownTotal) && total < knownTotal) {
      throw new SaveLectureError(`Media cut short (${total} of ${knownTotal} bytes)`, EXIT.error);
    }
    return total;
  }
  let written = offset;
  const started = Date.now();
  try {
    for (;;) {
      throwIfAborted(signal);
      let idle;
      const stalled = new Promise((_, reject) => {
        idle = setTimeout(
          () => reject(new SaveLectureError("Media stalled (no data for 30 s)", EXIT.error)),
          MEDIA_IDLE_MS,
        );
      });
      let chunk;
      try {
        chunk = await Promise.race([reader.read(), stalled]);
      } catch (err) {
        reader.cancel().catch(() => {});
        throw asAbortError(err);
      } finally {
        clearTimeout(idle);
      }
      const { done, value } = chunk;
      if (done) break;
      if (!value) continue;
      written += value.byteLength;
      if (written > MEDIA_MAX) {
        await reader.cancel();
        throw new SaveLectureError("Media too large", EXIT.error);
      }
      if (!fh.write(Buffer.from(value))) {
        await new Promise((r) => fh.once("drain", r));
      }
      const elapsed = Math.max(0.2, (Date.now() - started) / 1000);
      const mb = written / (1024 * 1024);
      const rate = (written - offset) / (1024 * 1024) / elapsed;
      const pct =
        Number.isFinite(knownTotal) && knownTotal > 0
          ? `${Math.min(100, (written / knownTotal) * 100).toFixed(1)}%`
          : `${mb.toFixed(1)} MB`;
      log.progress?.(`media ${pct}  ${rate.toFixed(2)} MB/s`);
    }
  } finally {
    await new Promise((resolve, reject) => {
      fh.end((err) => (err ? reject(err) : resolve()));
    });
    log.newline?.();
  }
  if (Number.isFinite(knownTotal) && written < knownTotal) {
    throw new SaveLectureError(`Media cut short (${written} of ${knownTotal} bytes)`, EXIT.error);
  }
  return written;
}

/** Resume automatically on dropped connections (long downloads on flaky networks). */
async function downloadMediaResilient(url, dest, fetchImpl, log, attempts = MEDIA_ATTEMPTS, delayMs = 1500, signal) {
  let last;
  for (let i = 0; i < attempts; i++) {
    throwIfAborted(signal);
    try {
      return await downloadMedia(url, dest, fetchImpl, log, signal);
    } catch (err) {
      if (isStoppedError(err)) throw err;
      if (err instanceof SaveLectureError && err.code !== EXIT.error) throw err;
      if (err instanceof SaveLectureError && /too large/i.test(err.message)) throw err;
      last = err;
      if (i < attempts - 1) {
        log.warn?.(`media interrupted (${err instanceof Error ? err.message : err}). Resuming (${i + 2}/${attempts})`);
        await sleep(delayMs * (i + 1), signal);
      }
    }
  }
  throw last instanceof Error ? last : new SaveLectureError(String(last), EXIT.error);
}

async function downloadSlide(src, fetchImpl, log, signal) {
  let url;
  try {
    url = ensurePdfPage(new URL(src));
  } catch {
    log.warn(`skip slide (bad url): ${src}`);
    return null;
  }
  try {
    const res = await fetchRetry(fetchImpl, url.toString(), { headers: CDN_HEADERS, timeoutMs: 20_000, allowForbidden: true, signal }, log);
    if (res.status === 429) {
      try {
        await res.body?.cancel();
      } catch {
        /* closed */
      }
      throw new SaveLectureError("Rate limited (429). Stopped.", EXIT.forbidden);
    }
    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {
        /* closed */
      }
      log.warn(`skip slide HTTP ${res.status}: ${src}`);
      return null;
    }
    const bytes = await readCapped(res, SLIDE_MAX_BYTES, "Slide");
    const kind = rasterKind(bytes, res.headers.get("content-type") || "");
    const ext = extForKind(kind);
    if (!ext) {
      log.warn(`skip slide (not a raster): ${src}`);
      return null;
    }
    return { src, bytes, ext, sha256: sha256Buf(bytes) };
  } catch (err) {
    if (err instanceof SaveLectureError && err.code === EXIT.archived) throw err;
    if (err instanceof SaveLectureError && err.code === EXIT.forbidden && /429/.test(err.message)) throw err;
    log.warn(`skip slide: ${src} (${err instanceof Error ? err.message : err})`);
    return null;
  }
}

async function maybeNotes(id, title, fetchImpl, log, signal) {
  const slug = title ? notesSlug(title) : "";
  if (!slug) return null;
  const candidates = [
    `https://player.uacdn.net/slides_pdf/${id}/${slug}_with_anno.pdf`,
    `https://player.uacdn.net/slides_pdf/${id}/${slug}_no_anno.pdf`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetchRetry(
        fetchImpl,
        url,
        { headers: CDN_HEADERS, timeoutMs: 20_000, allowForbidden: true, signal },
        log,
      );
      if (!res.ok) {
        try {
          await res.body?.cancel();
        } catch {
          /* closed */
        }
        log.warn(`notes skipped (HTTP ${res.status})`);
        continue;
      }
      const bytes = await readCapped(res, NOTES_MAX_BYTES, "Notes PDF");
      if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50) continue;
      return bytes;
    } catch (err) {
      if (err instanceof SaveLectureError && err.code === EXIT.archived) throw err;
      log.warn(`notes skipped: ${err instanceof Error ? err.message : err}`);
    }
  }
  return null;
}

function whichFfmpeg() {
  // path.delimiter is ";" on Windows and ":" elsewhere; Windows needs ffmpeg.exe.
  const names = process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg.cmd", "ffmpeg"] : ["ffmpeg"];
  const dirs = (process.env.PATH || process.env.Path || "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const p = join(dir.replace(/^"|"$/g, ""), name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `ffmpeg exited ${code}`));
    });
  });
}

export async function verifyBundle(dir, log = defaultLog()) {
  const checks = [];
  const push = (ok, label, detail = "") => {
    checks.push({ ok, label, detail });
    log.info(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  };
  const manPath = join(dir, "manifest.json");
  if (!existsSync(manPath)) {
    const partial = dir.endsWith(".partial") ? dir : `${dir}.partial`;
    const hasPayload =
      existsSync(join(dir, "media.webm")) ||
      existsSync(join(dir, "ink.json.gz")) ||
      existsSync(join(partial, "media.webm")) ||
      existsSync(join(partial, "ink.json.gz"));
    if (hasPayload) {
      const where = existsSync(join(partial, "media.webm")) || existsSync(join(partial, "ink.json.gz")) ? partial : dir;
      push(
        false,
        "manifest.json",
        `incomplete — ink/media are in ${where}. Re-run the same save command to finish (a missing notes PDF is skipped).`,
      );
    } else {
      push(false, "manifest.json", "missing");
    }
    return { ok: false, checks };
  }
  let manifest;
  try {
    manifest = validateManifest(JSON.parse(readFileSync(manPath, "utf8")));
    push(true, "manifest.json");
  } catch (err) {
    push(false, "manifest.json", err instanceof Error ? err.message : String(err));
    return { ok: false, checks };
  }
  const files = [manifest.files.ink, manifest.files.media, manifest.files.notes].filter(Boolean);
  for (const f of files) {
    const p = join(dir, f.path);
    if (!existsSync(p)) {
      push(false, f.path, "missing");
      continue;
    }
    const st = statSync(p);
    if (st.size !== f.bytes) {
      push(false, f.path, `size ${st.size} != ${f.bytes}`);
      continue;
    }
    const hash = sha256File(p);
    if (hash !== f.sha256) {
      push(false, f.path, "sha256 mismatch");
      continue;
    }
    push(true, f.path);
  }
  for (const s of manifest.slides) {
    const p = join(dir, s.path);
    if (!existsSync(p)) {
      push(false, s.path, "missing");
      continue;
    }
    const hash = sha256File(p);
    if (hash !== s.sha256) {
      push(false, s.path, "sha256 mismatch");
      continue;
    }
    push(true, s.path);
  }
  return { ok: checks.every((c) => c.ok), checks, manifest };
}

/** Size-only check: no hashing. Used when skipping already-saved lectures. */
export async function quickVerifyBundle(dir, log = defaultLog()) {
  const manPath = join(dir, "manifest.json");
  if (!existsSync(manPath)) return { ok: false, checks: [{ ok: false, label: "manifest.json", detail: "missing" }] };
  let manifest;
  try {
    manifest = validateManifest(JSON.parse(readFileSync(manPath, "utf8")));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.info(`FAIL  manifest.json  ${detail}`);
    return { ok: false, checks: [{ ok: false, label: "manifest.json", detail }] };
  }
  const files = [manifest.files.ink, manifest.files.media, manifest.files.notes].filter(Boolean);
  for (const f of files) {
    const p = join(dir, f.path);
    if (!existsSync(p)) return { ok: false, checks: [{ ok: false, label: f.path, detail: "missing" }], manifest };
    const st = statSync(p);
    if (st.size !== f.bytes) {
      return { ok: false, checks: [{ ok: false, label: f.path, detail: `size ${st.size} != ${f.bytes}` }], manifest };
    }
  }
  for (const s of manifest.slides) {
    if (!existsSync(join(dir, s.path))) {
      return { ok: false, checks: [{ ok: false, label: s.path, detail: "missing" }], manifest };
    }
  }
  return { ok: true, checks: [{ ok: true, label: "manifest.json" }], manifest };
}

export async function saveLecture({ id, outDir, fetch: fetchImpl, log, opts = {} }) {
  const logger = log || defaultLog();
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new SaveLectureError("Invalid lesson id", EXIT.args);
  }
  const root = resolve(outDir || "./saved");
  mkdirSync(root, { recursive: true });
  const folder = typeof opts.dirName === "string" && opts.dirName ? opts.dirName : `lecture-${id}`;
  if (!isSafeFolderName(folder)) {
    throw new SaveLectureError("Invalid folder name", EXIT.args);
  }
  const signal = opts.signal;
  const finalDir = join(root, folder);
  const partialDir = join(root, `${folder}.partial`);

  if (existsSync(join(finalDir, "manifest.json")) && !existsSync(partialDir)) {
    const prior = await quickVerifyBundle(finalDir, {
      info: () => {},
      warn: logger.warn,
      error: logger.error,
    });
    if (prior.ok && prior.manifest) {
      logger.info(`Already saved ${finalDir}`);
      return { dir: finalDir, manifest: prior.manifest, timeline: null, resumed: true };
    }
    logger.warn("Existing folder failed verify; resuming into a partial folder");
    renameSync(finalDir, partialDir);
  }

  mkdirSync(partialDir, { recursive: true });
  mkdirSync(join(partialDir, "slides"), { recursive: true });

  logger.info(`Saving ${id}`);
  const inkPath = join(partialDir, "ink.json.gz");
  let rawInk;
  if (existsSync(inkPath) && statSync(inkPath).size > 0) {
    logger.info("ink.json.gz already present");
    rawInk = readFileSync(inkPath);
  } else {
    rawInk = await fetchInk(id, fetchFn, logger, signal);
    writeFileSync(inkPath, gzipInk(rawInk));
  }
  logger.info(`Ink ${(rawInk.byteLength / (1024 * 1024)).toFixed(1)} MB`);
  const jsonText = decodeInk(rawInk);
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new SaveLectureError("Unexpected notes format", EXIT.error);
  const timeline = compactEvents(id, parsed);

  const seen = new Set();
  const slideSrcs = [];
  for (const s of timeline.slides) {
    if (!s.url) continue;
    const orig = unproxySlideUrl(s.url);
    if (!orig || seen.has(orig)) continue;
    seen.add(orig);
    slideSrcs.push(orig);
  }

  const slideHits = await poolMap(slideSrcs, SLIDE_CONCURRENCY, (src) => downloadSlide(src, fetchFn, logger, signal));
  const missing = slideHits.filter((h) => !h).length;
  if (slideSrcs.length && missing / slideSrcs.length > 0.2) {
    throw new SaveLectureError(`Too many missing slides (${missing}/${slideSrcs.length})`, EXIT.error);
  }

  const slides = [];
  let n = 0;
  for (const hit of slideHits) {
    if (!hit) continue;
    const name = `slides/${String(n).padStart(3, "0")}.${hit.ext}`;
    writeFileSync(join(partialDir, name), hit.bytes);
    slides.push({ src: hit.src, path: name, sha256: hit.sha256 });
    n += 1;
  }

  let mediaFile;
  if (!opts.noMedia) {
    const part = join(partialDir, "media.webm.part");
    const dest = join(partialDir, "media.webm");
    if (existsSync(dest) && statSync(dest).size > 0) {
      logger.info("media.webm already present");
    } else {
      const url = `https://uamedia.uacdn.net/lesson-raw/${id}/output.webm`;
      await downloadMediaResilient(url, part, fetchFn, logger, opts.mediaAttempts ?? MEDIA_ATTEMPTS, opts.mediaRetryDelayMs ?? 1500, signal);
      if (existsSync(dest)) rmSync(dest);
      renameSync(part, dest);
    }
    if (opts.remux) {
      const bin = opts.whichFfmpeg ? opts.whichFfmpeg() : whichFfmpeg();
      if (!bin) logger.warn("ffmpeg not on PATH; skipping remux");
      else {
        try {
          const tmp = join(partialDir, "fixed.webm");
          const run = opts.ffmpeg || ((args) => runFfmpeg(bin, args));
          await run(["-y", "-i", dest, "-c", "copy", tmp]);
          rmSync(dest);
          renameSync(tmp, dest);
          logger.info("remuxed media.webm");
        } catch (err) {
          logger.warn(`remux failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    const bytes = statSync(dest).size;
    mediaFile = { path: "media.webm", bytes, sha256: sha256File(dest) };
  } else {
    writeFileSync(join(partialDir, "media.webm"), Buffer.alloc(0));
    mediaFile = { path: "media.webm", bytes: 0, sha256: sha256Buf(Buffer.alloc(0)) };
  }

  let notesFile;
  if (!opts.title) {
    logger.warn(
      'No --title given: the notes PDF is skipped and the library will show "Live class". Re-run with --title "<lecture title>".',
    );
  }
  if (!opts.noNotes && opts.title) {
    const notes = await maybeNotes(id, opts.title, fetchFn, logger, signal);
    if (notes) {
      writeFileSync(join(partialDir, "notes.pdf"), notes);
      notesFile = { path: "notes.pdf", bytes: notes.byteLength, sha256: sha256Buf(notes) };
    }
  }

  const manifest = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    lessonId: id,
    title: opts.title || timeline.title || "Live class",
    kind: timeline.kind,
    durationMs: timeline.durationMs,
    savedAt: (opts.now ? opts.now() : new Date()).toISOString(),
    parserVersion: PARSER_VERSION,
    files: notesFile
      ? { ink: fileEntry("ink.json.gz", inkPath), media: mediaFile, notes: notesFile }
      : { ink: fileEntry("ink.json.gz", inkPath), media: mediaFile },
    slides,
  };
  validateManifest(manifest);
  const manTmp = join(partialDir, "manifest.json.tmp");
  writeFileSync(manTmp, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(manTmp, join(partialDir, "manifest.json"));

  if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true });
  renameSync(partialDir, finalDir);
  logger.info(`Wrote ${finalDir}`);
  return { dir: finalDir, manifest, timeline, resumed: false };
}

function fileEntry(path, abs) {
  return { path, bytes: statSync(abs).size, sha256: sha256File(abs) };
}

export const SAVE_USAGE = `usage:
  npm run save -- WY106R57G6SA54R3JCHR
  npm run save -- WY106R57G6SA54R3JCHR --out ./saved --remux
  npm run save -- --verify ./saved/lecture-WY106R57G6SA54R3JCHR

Do not type the square brackets from the docs. Leave a space after --.`;

function normalizeArg(raw) {
  return String(raw ?? "")
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .trim();
}

export function parseSaveArgs(argv) {
  const args = argv.map(normalizeArg).filter(Boolean);
  const opts = { out: "./saved", noMedia: false, noNotes: false, remux: false, verify: null, id: null };
  while (args.length) {
    const a = args.shift();
    if (a === "--help" || a === "-h" || a === "help") {
      return { error: SAVE_USAGE, code: EXIT.args };
    } else if (a === "--verify") {
      opts.verify = args.shift() || null;
    } else if (a === "--out") {
      opts.out = args.shift() || "./saved";
    } else if (a === "--no-media") {
      opts.noMedia = true;
    } else if (a === "--no-notes") {
      opts.noNotes = true;
    } else if (a === "--remux") {
      opts.remux = true;
    } else if (a === "--title") {
      opts.title = args.shift();
    } else if (a?.startsWith("-")) {
      return { error: `unknown flag ${a}\n${SAVE_USAGE}`, code: EXIT.args };
    } else if (!opts.id) {
      opts.id = a;
    } else {
      return { error: `unexpected argument ${a}\n${SAVE_USAGE}`, code: EXIT.args };
    }
  }
  if (opts.verify) return { verify: opts.verify };
  if (!opts.id) return { error: SAVE_USAGE, code: EXIT.args };
  return opts;
}
