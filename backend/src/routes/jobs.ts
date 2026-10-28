import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, statfsSync, writeFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { JOB_DIR } from "../config/env.ts";
import { jsonError } from "../http.ts";
import { artifactType, safeArtifactPath } from "../integrations/ffmpeg/artifacts.ts";
import { ZIP32_LIMIT, listZipEntries, zipStoreStream, zipTotalSize } from "../lib/zip-store.ts";
import { enqueueEnhance, enhanceMedia } from "../integrations/ffmpeg/pipeline.ts";
import { clipArgs, clipFileName, clipWindow } from "../integrations/ffmpeg/plan.ts";
import { ffmpegBinary } from "../integrations/ffmpeg/probe.ts";
import { runFfmpeg } from "../integrations/ffmpeg/run.ts";
import { firstInkSec } from "@inkboard/shared/dcn";
import { ArtifactParams, ClipBody, JobIdParams, LectureJobBody, parseInput } from "../dto/validate.ts";

type JobState = "queued" | "running" | "done" | "error" | "cancelled";
type Job = {
  id: string;
  kind: "lecture" | "chapter" | "course";
  state: JobState;
  pct: number;
  step: string;
  error?: string;
  outDir: string;
  payload: Record<string, unknown>;
  abort: AbortController;
  /** Returned once, to the caller that created the job. Required to cancel. */
  token?: string;
  mediaDir?: string;
};

const jobs = new Map<string, Job>();
export const JOB_CAP = 1000;

/* ---------------- disk guard ---------------- */

const GB = 1024 ** 3;

function envGb(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Free bytes on the JOB_DIR volume, or Infinity when the OS will not say. */
export function freeBytes(dir = JOB_DIR): number {
  try {
    mkdirSync(dir, { recursive: true });
    const s = statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function treeSize(path: string, depth = 0): number {
  if (depth > 6) return 0;
  try {
    const st = statSync(path);
    if (!st.isDirectory()) return st.size;
    let n = 0;
    for (const name of readdirSync(path)) n += treeSize(join(path, name), depth + 1);
    return n;
  } catch {
    return 0;
  }
}

/**
 * Keep JOB_DIR under JOB_DIR_MAX_GB (default 20) by deleting the folders of the
 * oldest finished jobs. Queued and running jobs are never touched.
 */
export function pruneJobDirs(dir = JOB_DIR, maxBytes = envGb("JOB_DIR_MAX_GB", 20) * GB): { removed: string[]; total: number } {
  const removed: string[] = [];
  if (!existsSync(dir) || maxBytes <= 0) return { removed, total: 0 };
  const busy = new Set([...jobs.values()].filter((j) => j.state === "queued" || j.state === "running").map((j) => j.outDir));
  let entries: { path: string; size: number; at: number }[] = [];
  try {
    entries = readdirSync(dir)
      .map((name) => join(dir, name))
      .filter((path) => !busy.has(path) && existsSync(join(path, "job.json")))
      .map((path) => ({ path, size: treeSize(path), at: statSync(path).mtimeMs }));
  } catch {
    return { removed, total: 0 };
  }
  let total = entries.reduce((n, e) => n + e.size, 0) + [...busy].reduce((n, p) => n + treeSize(p), 0);
  entries.sort((a, b) => a.at - b.at);
  for (const e of entries) {
    if (total <= maxBytes) break;
    try {
      rmSync(e.path, { recursive: true, force: true });
      total -= e.size;
      removed.push(e.path);
      for (const [id, job] of jobs) if (job.outDir === e.path) forgetJob(id);
    } catch {
      /* in use; try the next one */
    }
  }
  if (removed.length) console.log(`[jobs] pruned ${removed.length} old job folder(s) to stay under ${Math.round(maxBytes / GB)} GB`);
  return { removed, total };
}

/** Refuse new downloads below JOB_MIN_FREE_GB (default 2; a 90-minute class needs ~0.5 GB with HLS rungs). */
export function diskTooFull(dir = JOB_DIR, minFree = envGb("JOB_MIN_FREE_GB", 2) * GB): boolean {
  return freeBytes(dir) < minFree;
}
/** Age alone does not evict. Callers use this to tell a finished job is still on disk. */
export const FINISHED_TTL_MS = 5 * 60_000;
/** A missing id is not scanned again until this passes. */
export const JOB_MISS_MS = 30_000;
const finishedAt = new Map<string, number>();
const missingUntil = new Map<string, number>();
const lectureFlights = new Map<string, Promise<{ job: Job; created: boolean }>>();
let dirReads = 0;
let lectureRuns = 0;
const lectureRunsFor = new Map<string, number>();
const RESTART_DIR = /^[0-9a-f]{8}$/;
/** Unknown ids remembered at once. Older ones drop first. */
export const JOB_MISS_CAP = 5_000;

function finishedRank(state: JobState): number {
  if (state === "error" || state === "cancelled") return 0;
  if (state === "done") return 1;
  return 2;
}

/**
 * Under the cap, keep every job. Over the cap, drop finished jobs only:
 * oldest error and cancelled first, then oldest done. Queued and running stay.
 */
export function evictFinishedJobs() {
  if (jobs.size <= JOB_CAP) return;
  const victims = [...jobs.values()].filter((job) => finishedRank(job.state) < 2);
  victims.sort((a, b) => {
    const byState = finishedRank(a.state) - finishedRank(b.state);
    if (byState !== 0) return byState;
    return (finishedAt.get(a.id) ?? 0) - (finishedAt.get(b.id) ?? 0);
  });
  for (const job of victims) {
    if (jobs.size <= JOB_CAP) break;
    jobs.delete(job.id);
    finishedAt.delete(job.id);
    lectureRunsFor.delete(job.id);
  }
}

export function markFinished(id: string, at = Date.now()) {
  finishedAt.set(id, at);
}

export function jobCount() {
  return jobs.size;
}

/** How many times a lookup listed JOB_DIR. A cached miss does not add one. */
export function jobDirReadCount() {
  return dirReads;
}

export function jobMissCount() {
  return missingUntil.size;
}

export function lectureRunCount(id?: string) {
  if (id) return lectureRunsFor.get(id) ?? 0;
  return lectureRuns;
}

/** Drop misses whose window has passed. The jobs timer calls this every minute. */
export function sweepMissingJobs(now = Date.now()) {
  for (const [key, until] of missingUntil) {
    if (until <= now) missingUntil.delete(key);
  }
}

function rememberMiss(key: string, now: number) {
  if (missingUntil.has(key)) missingUntil.delete(key);
  missingUntil.set(key, now + JOB_MISS_MS);
  while (missingUntil.size > JOB_MISS_CAP) {
    const oldest = missingUntil.keys().next().value;
    if (oldest === undefined) break;
    missingUntil.delete(oldest);
  }
}

/** A restarted failure gets a new directory. The first attempt may use `id` itself. */
export function allocateOutDir(root: string, id: string, restart: boolean): string {
  if (!restart) {
    const primary = join(root, id);
    if (!existsSync(join(primary, "job.json"))) return primary;
  }
  return join(root, `${id}-${randomBytes(4).toString("hex")}`);
}

export function rememberJob(job: Job, evict = true) {
  jobs.set(job.id, job);
  if (job.state === "done" || job.state === "error" || job.state === "cancelled") {
    markFinished(job.id);
  }
  if (evict) evictFinishedJobs();
}

/** Drop the in-memory copy. The directory on disk is left alone. */
export function forgetJob(id: string) {
  jobs.delete(id);
  finishedAt.delete(id);
  lectureRunsFor.delete(id);
}

export function jobView(id: string) {
  const job = jobs.get(id);
  if (!job) return null;
  return { id: job.id, state: job.state, error: job.error, mediaDir: job.mediaDir };
}

function persistJob(job: Job) {
  try {
    mkdirSync(job.outDir, { recursive: true });
    writeFileSync(
      join(job.outDir, "job.json"),
      JSON.stringify({
        id: job.id,
        kind: job.kind,
        state: job.state,
        pct: job.pct,
        step: job.step,
        error: job.error,
        outDir: job.outDir,
        mediaDir: job.mediaDir,
        payload: job.payload,
      }),
    );
  } catch {
    /* the in-memory job still serves this process */
  }
  void import("../jobs/pg-queue.ts")
    .then((mod) => mod.mirrorJob(job))
    .catch(() => {
      /* disk copy remains if postgres is down */
    });
}

function preferStored(prev: Job, next: Job, nextFile: string): boolean {
  const rank = (state: JobState) => (state === "done" ? 2 : 1);
  if (rank(next.state) !== rank(prev.state)) return rank(next.state) > rank(prev.state);
  try {
    return statSync(nextFile).mtimeMs >= statSync(join(prev.outDir, "job.json")).mtimeMs;
  } catch {
    return true;
  }
}

/** Finished jobs survive a restart so sprite / audio / HLS URLs keep working. */
export function loadStoredJobs(dir = JOB_DIR) {
  if (!existsSync(dir)) return 0;
  let loaded = 0;
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    const file = join(dir, name, "job.json");
    if (!existsSync(file)) continue;
    try {
      const next = readStoredJob(file);
      if (!next) continue;
      const prev = jobs.get(next.id);
      if (prev && !preferStored(prev, next, file)) continue;
      jobs.set(next.id, next);
      markFinished(next.id, statSync(file).mtimeMs || Date.now());
      loaded += 1;
    } catch {
      /* skip a corrupt job file */
    }
  }
  return loaded;
}

function readStoredJob(file: string): Job | null {
  try {
    return jobFromStored(JSON.parse(readFileSync(file, "utf8")) as Partial<Job>);
  } catch {
    return null;
  }
}

function jobFromStored(raw: Partial<Job>): Job | null {
  if (!raw.id || !raw.outDir) return null;
  let state: JobState = raw.state === "done" || raw.state === "cancelled" || raw.state === "error" ? raw.state : "error";
  let error = raw.error;
  if (raw.state === "queued" || raw.state === "running") {
    state = "error";
    error = "Interrupted. Save the class again.";
  }
  const id = String(raw.id);
  return {
    id,
    kind: raw.kind === "chapter" || raw.kind === "course" ? raw.kind : "lecture",
    state,
    pct: Number(raw.pct) || (state === "done" ? 100 : 0),
    step: String(raw.step || state),
    error,
    outDir: String(raw.outDir),
    mediaDir: raw.mediaDir ? String(raw.mediaDir) : undefined,
    payload: raw.payload && typeof raw.payload === "object" ? raw.payload : {},
    abort: new AbortController(),
  };
}

async function considerStoredFile(best: { job: Job; file: string } | null, file: string): Promise<{ job: Job; file: string } | null> {
  try {
    const job = jobFromStored(JSON.parse(await readFile(file, "utf8")) as Partial<Job>);
    if (!job) return best;
    if (!best || preferStored(best.job, job, file)) return { job, file };
    return best;
  } catch {
    return best;
  }
}

/**
 * A lookup miss reads `JOB_DIR/<id>/job.json`, or the newest `<id>-xxxxxxxx`
 * restart directory. A done copy beats an older failure. Unknown ids are
 * remembered for JOB_MISS_MS so a random id does not list the directory again.
 */
export async function rehydrateJob(id: string, dir = JOB_DIR, now = Date.now()): Promise<Job | null> {
  const cached = jobs.get(id);
  if (cached) return cached;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  const key = `${dir}\0${id}`;
  const until = missingUntil.get(key);
  if (until !== undefined && now < until) return null;
  dirReads += 1;
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    rememberMiss(key, now);
    return null;
  }
  let best = await considerStoredFile(null, join(dir, id, "job.json"));
  if (best && best.job.id !== id) best = null;
  const prefix = `${id}-`;
  for (const name of names) {
    if (!name.startsWith(prefix) || !RESTART_DIR.test(name.slice(prefix.length))) continue;
    const file = join(dir, name, "job.json");
    const next = await considerStoredFile(null, file);
    if (!next || next.job.id !== id) continue;
    if (!best || preferStored(best.job, next.job, file)) best = next;
  }
  if (!best) {
    rememberMiss(key, now);
    return null;
  }
  missingUntil.delete(key);
  if (jobs.has(id)) return jobs.get(id) ?? null;
  jobs.set(best.job.id, best.job);
  let at = now;
  try {
    at = (await stat(best.file)).mtimeMs || at;
  } catch {
    /* the file was readable a moment ago */
  }
  if (best.job.state === "done" || best.job.state === "error" || best.job.state === "cancelled") {
    markFinished(best.job.id, at);
  }
  return best.job;
}

async function liveJob(id: string): Promise<Job | null> {
  return jobs.get(id) ?? (await rehydrateJob(id));
}

function jobId(kind: string, payload: unknown) {
  return createHash("sha256").update(JSON.stringify({ kind, payload })).digest("hex").slice(0, 24);
}

export function lectureJobPayload(body: {
  id?: string;
  title?: string;
  remux?: boolean;
  noMedia?: boolean;
  noNotes?: boolean;
  enhance?: boolean;
}) {
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return null;
  return {
    id,
    title: body.title,
    remux: Boolean(body.remux),
    noMedia: Boolean(body.noMedia),
    noNotes: Boolean(body.noNotes),
    enhance: Boolean(body.enhance),
  };
}

export function recordLectureRun(id: string) {
  lectureRuns += 1;
  const next = (lectureRunsFor.get(id) ?? 0) + 1;
  lectureRunsFor.delete(id);
  lectureRunsFor.set(id, next);
  while (lectureRunsFor.size > JOB_CAP) {
    const oldest = lectureRunsFor.keys().next().value;
    if (oldest === undefined) break;
    lectureRunsFor.delete(oldest);
  }
}

/**
 * The logger `saveLecture` expects: an object with info/warn/error/progress/newline.
 * Every line becomes the job's `step` so a poll shows where the save is.
 * `progress` carries "media 42%  1.20 MB/s"; the percentage is lifted into `pct`.
 */
export function jobStepLogger(job: { step: string; pct: number }) {
  const note = (m: unknown) => {
    job.step = String(m).slice(0, 180);
  };
  return {
    info: note,
    warn: note,
    error: note,
    progress: (m: unknown) => {
      note(m);
      const pct = /\b(\d{1,3})%/.exec(String(m));
      if (pct) job.pct = Math.max(0, Math.min(99, Number(pct[1])));
    },
    newline: () => {},
  };
}

async function runLecture(job: Job) {
  recordLectureRun(job.id);
  job.state = "running";
  job.step = "saving";
  persistJob(job);
  try {
    mkdirSync(job.outDir, { recursive: true });
    const id = String(job.payload.id || "");
    const remux = Boolean(job.payload.remux);
    const { saveLecture } = await import("../cli/lib/save-lecture-core.mjs");
    const saved = await saveLecture({
      id,
      outDir: job.outDir,
      fetch: globalThis.fetch,
      log: jobStepLogger(job),
      opts: {
        noMedia: Boolean(job.payload.noMedia),
        noNotes: Boolean(job.payload.noNotes),
        remux,
        title: typeof job.payload.title === "string" ? job.payload.title : "",
        signal: job.abort.signal,
      },
    });
    if (saved?.dir) job.mediaDir = saved.dir;
    if (job.payload.enhance && saved?.dir && !job.payload.noMedia) {
      job.step = "enhancing";
      persistJob(job);
      const media = join(saved.dir, "media.webm");
      if (existsSync(media) && statSync(media).size > 0) {
        let ink: number | null = null;
        try {
          if (saved.timeline?.strokes) ink = firstInkSec(saved.timeline);
        } catch {
          ink = null;
        }
        const report = await enqueueEnhance(() =>
          enhanceMedia({ input: media, outDir: saved.dir, firstInkSec: ink, signal: job.abort.signal }),
        );
        const failed = report.steps.filter((s) => !s.ok).map((s) => s.name);
        job.step = report.skipped ? `done (${report.skipped})` : failed.length ? `done (partial: ${failed.join(",")})` : "done";
      }
    }
    job.state = "done";
    job.pct = 100;
    if (job.step === "enhancing" || job.step === "saving") job.step = "done";
    markFinished(job.id);
    persistJob(job);
  } catch (err) {
    if (job.abort.signal.aborted) {
      job.state = "cancelled";
      job.error = "Stopped";
      markFinished(job.id);
      persistJob(job);
      return;
    }
    job.state = "error";
    job.error = err instanceof Error ? err.message : String(err);
    markFinished(job.id);
    persistJob(job);
  }
}

/** `Title - LESSONID.zip`, Windows-safe, short. */
export function bundleFileName(title: string, lessonId: string) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what Windows file names forbid
  const clean = title.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const id = lessonId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "lecture";
  return `${clean ? `${clean} - ` : ""}${id}.zip`;
}

function reusableJob(job: Job) {
  return job.state === "queued" || job.state === "running" || job.state === "done";
}

function lectureView(jid: string, job: Job, created: boolean, enhance: boolean) {
  return {
    id: jid,
    state: job.state,
    pct: job.pct,
    step: job.step,
    ...(created ? { enhance, token: job.token } : {}),
  };
}

async function startLecture(jid: string, payload: Record<string, unknown>): Promise<{ job: Job; created: boolean }> {
  const memory = jobs.get(jid);
  if (memory && reusableJob(memory)) return { job: memory, created: false };
  const stored = memory ? null : await rehydrateJob(jid);
  const raced = jobs.get(jid);
  if (raced && reusableJob(raced)) return { job: raced, created: false };
  const prior = raced ?? stored;
  const restarting = Boolean(prior && (prior.state === "error" || prior.state === "cancelled"));
  const job: Job = {
    id: jid,
    kind: "lecture",
    state: "queued",
    pct: 0,
    step: "queued",
    outDir: allocateOutDir(JOB_DIR, jid, restarting),
    payload,
    abort: new AbortController(),
    token: randomBytes(24).toString("hex"),
  };
  jobs.set(jid, job);
  persistJob(job);
  void runLecture(job).catch((err) => {
    job.state = "error";
    job.error = err instanceof Error ? err.message : String(err);
    markFinished(job.id);
    persistJob(job);
    console.error("[jobs] lecture run failed", job.id, err instanceof Error ? err.message : err);
  });
  return { job, created: true };
}

type ByteSpan = { start: number; end: number };

/** One `bytes=` range. Multiple ranges are ignored so the whole file is sent. */
export function singleByteRange(header: string, size: number): ByteSpan | "ignore" | "unsatisfiable" {
  const trimmed = header.trim();
  const eq = trimmed.indexOf("=");
  if (!/^bytes=/i.test(trimmed) || eq < 0) return "ignore";
  const spec = trimmed.slice(eq + 1).trim();
  if (spec.includes(",")) return "ignore";
  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match || (match[1] === "" && match[2] === "")) return "unsatisfiable";
  if (!Number.isFinite(size) || size <= 0) return "unsatisfiable";
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  if (!Number.isInteger(start) || start < 0 || start >= size) return "unsatisfiable";
  let end = match[2] === "" ? size - 1 : Number(match[2]);
  if (!Number.isInteger(end) || end < start) return "unsatisfiable";
  if (end >= size) end = size - 1;
  return { start, end };
}

function sameJobToken(presented: string, expected: string): boolean {
  const got = Buffer.from(presented);
  const want = Buffer.from(expected);
  if (got.length !== want.length || want.length === 0) return false;
  return timingSafeEqual(got, want);
}

export async function registerJobs(app: FastifyInstance) {
  loadStoredJobs();
  pruneJobDirs();
  let sweeps = 0;
  const timer = setInterval(() => {
    evictFinishedJobs();
    sweepMissingJobs();
    sweeps += 1;
    if (sweeps % 15 === 0) pruneJobDirs();
  }, 60_000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
  });
  app.post("/api/jobs/lectures", async (req, reply) => {
    evictFinishedJobs();
    const body = parseInput(LectureJobBody, req.body ?? {}, "body");
    const payload = lectureJobPayload(body);
    if (!payload) {
      return reply.status(400).send(jsonError(400, "Invalid lesson id", "BAD_REQUEST"));
    }
    const jid = jobId("lecture", payload);
    const existing = jobs.get(jid);
    if (existing && reusableJob(existing)) return lectureView(jid, existing, false, payload.enhance);
    if (!lectureFlights.has(jid) && diskTooFull()) {
      // A lecture already saved on disk costs nothing to reuse; only refuse new downloads.
      const stored = await rehydrateJob(jid);
      if (stored && reusableJob(stored)) {
        const { job } = await startLecture(jid, payload);
        return lectureView(jid, job, false, payload.enhance);
      }
      pruneJobDirs();
      if (diskTooFull()) {
        return reply.status(507).send(jsonError(507, "The server is low on disk space. Ask the admin to free some room.", "DISK_FULL"));
      }
    }
    let flight = lectureFlights.get(jid);
    const startedHere = !flight;
    if (!flight) {
      flight = startLecture(jid, payload);
      lectureFlights.set(jid, flight);
      flight.finally(() => {
        if (lectureFlights.get(jid) === flight) lectureFlights.delete(jid);
      }).catch(() => {});
    }
    const { job, created } = await flight;
    return lectureView(jid, job, created && startedHere, payload.enhance);
  });

  app.get("/api/jobs/:id/artifacts/*", async (req, reply) => {
    const params = parseInput(ArtifactParams, req.params, "params");
    const job = await liveJob(params.id);
    if (!job) return reply.status(404).send(jsonError(404, "Unknown job", "NOT_FOUND"));
    const root = job.mediaDir || job.outDir;
    const rel = params["*"] || "";
    const abs = safeArtifactPath(root, rel);
    if (!abs) return reply.status(400).send(jsonError(400, "Unknown artifact", "BAD_REQUEST"));
    if (!existsSync(abs)) return reply.status(404).send(jsonError(404, "Artifact not ready", "NOT_FOUND"));
    const rangeHeader = req.headers.range;
    const range = Array.isArray(rangeHeader) ? rangeHeader.join(",") : rangeHeader;
    reply.header("accept-ranges", "bytes");
    reply.header("content-type", artifactType(rel));
    reply.header("cache-control", "private, max-age=3600");
    if (typeof range === "string" && range.length > 0) {
      const size = statSync(abs).size;
      const parsed = singleByteRange(range, size);
      if (parsed === "unsatisfiable") {
        reply.header("content-range", `bytes */${size}`);
        return reply.status(416).send();
      }
      if (parsed !== "ignore") {
        reply.header("content-range", `bytes ${parsed.start}-${parsed.end}/${size}`);
        reply.header("content-length", String(parsed.end - parsed.start + 1));
        return reply.status(206).send(createReadStream(abs, { start: parsed.start, end: parsed.end }));
      }
    }
    return reply.send(createReadStream(abs));
  });

  /**
   * The whole saved lecture folder (manifest, ink, slides, media, notes, previews) as one STORE zip,
   * streamed straight from disk. Drop it on /offline (or unzip it) to play without the server.
   */
  app.get("/api/jobs/:id/bundle.zip", async (req, reply) => {
    const params = parseInput(JobIdParams, req.params, "params");
    const job = await liveJob(params.id);
    if (!job) return reply.status(404).send(jsonError(404, "Unknown job", "NOT_FOUND"));
    if (job.state !== "done" || !job.mediaDir) {
      return reply.status(409).send(jsonError(409, "Bundle not ready", "NOT_READY"));
    }
    if (!existsSync(join(job.mediaDir, "manifest.json"))) {
      return reply.status(404).send(jsonError(404, "Bundle not on disk", "NOT_FOUND"));
    }
    const entries = await listZipEntries(job.mediaDir);
    const total = zipTotalSize(entries);
    if (total > ZIP32_LIMIT) {
      return reply.status(413).send(jsonError(413, "Bundle over 4 GB; use the folder on disk", "TOO_LARGE"));
    }
    const name = bundleFileName(String(job.payload.title || ""), String(job.payload.id || job.id));
    const ac = new AbortController();
    req.raw.on("close", () => ac.abort());
    reply.header("content-type", "application/zip");
    reply.header("content-length", String(total));
    reply.header("content-disposition", `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    reply.header("cache-control", "private, no-store");
    return reply.send(zipStoreStream(entries, ac.signal));
  });

  app.get("/api/jobs/:id", async (req, reply) => {
    const params = parseInput(JobIdParams, req.params, "params");
    const job = await liveJob(params.id);
    if (!job) return reply.status(404).send(jsonError(404, "Unknown job", "NOT_FOUND"));
    return { id: job.id, state: job.state, pct: job.pct, step: job.step, error: job.error };
  });

  app.post("/api/jobs/:id/clips", async (req, reply) => {
    const params = parseInput(JobIdParams, req.params, "params");
    const job = await liveJob(params.id);
    if (!job) return reply.status(404).send(jsonError(404, "Unknown job", "NOT_FOUND"));
    const root = job.mediaDir || job.outDir;
    const body = parseInput(ClipBody, req.body ?? {}, "body");
    const window = clipWindow(Number(body.start), Number(body.end));
    if (!window) return reply.status(400).send(jsonError(400, "Clip must be between 1 second and 20 minutes", "BAD_REQUEST"));
    const media = ["media.mp4", "media.webm"].map((name) => join(root, name)).find((abs) => existsSync(abs));
    if (!media) return reply.status(404).send(jsonError(404, "Prepare this class before saving a clip", "NOT_FOUND"));
    const rel = clipFileName(window.start, window.end);
    const abs = safeArtifactPath(root, rel);
    if (!abs) return reply.status(400).send(jsonError(400, "Unknown artifact", "BAD_REQUEST"));
    if (!existsSync(abs)) {
      const bin = ffmpegBinary();
      if (!bin) return reply.status(503).send(jsonError(503, "ffmpeg is not available", "UNAVAILABLE"));
      mkdirSync(join(root, "clips"), { recursive: true });
      try {
        await enqueueEnhance(() => runFfmpeg(bin, clipArgs(media, abs, window.start, window.end), { timeoutMs: 15 * 60_000 }));
      } catch (err) {
        req.log.error({ err }, "clip failed");
        return reply.status(500).send(jsonError(500, "Something went wrong", "CLIP_FAILED"));
      }
    }
    return { url: `/api/jobs/${job.id}/artifacts/${rel}`, start: window.start, end: window.end };
  });

  app.delete("/api/jobs/:id", async (req, reply) => {
    const params = parseInput(JobIdParams, req.params, "params");
    const job = jobs.get(params.id);
    if (!job) return reply.status(404).send(jsonError(404, "Unknown job", "NOT_FOUND"));
    if (job.state === "done" || job.state === "error" || job.state === "cancelled") {
      return reply.status(409).send(jsonError(409, `Job already ${job.state}`, "CONFLICT"));
    }
    const header = req.headers["x-job-token"];
    const presented = typeof header === "string" ? header : "";
    if (!job.token || !sameJobToken(presented, job.token)) {
      return reply.status(403).send(jsonError(403, "This job belongs to someone else", "FORBIDDEN"));
    }
    job.abort.abort();
    job.state = "cancelled";
    markFinished(job.id);
    persistJob(job);
    return { id: job.id, state: job.state };
  });
}
