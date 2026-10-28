/**
 * Save one chapter (one Unacademy week) by calling saveLecture once per lecture, in order.
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, existsSync } from "node:fs";
import { statfsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  CHAPTER_SAVED_FORMAT,
  CHAPTER_VERSION,
  assignLectureDirs,
  chapterFileSlug,
  chapterFolderName,
  courseFolderName,
  estimateLectureBytes,
  formatChapterDuration,
  formatPlanHours,
  estimatePlanBytes,
  isOldChapterFolder,
  isOldLectureFolder,
  lectureDirName,
  lectureNeedsDownload,
  uniqueName,
  validateChapter,
} from "@inkboard/shared/bundle/chapter";
import { EXIT, SaveLectureError, isStoppedError, quickVerifyBundle, saveLecture, verifyBundle } from "./save-lecture-core.mjs";

const PAUSE_MIN_MS = 3000;
const PAUSE_MAX_MS = 8000;
const RETRY_MIN_MS = 5000;
const RETRY_MAX_MS = 15000;
export const RUN_MAX_DEFAULT = 30;
export const RUN_MAX_HARD = 60;

export { EXIT, SaveLectureError, isStoppedError };

function defaultLog() {
  return {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m) => console.error(m),
    progress: (m) => {
      process.stdout.write(`\r${m}`);
    },
    newline: () => process.stdout.write("\n"),
  };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SaveLectureError("Stopped", EXIT.error, { aborted: true }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new SaveLectureError("Stopped", EXIT.error, { aborted: true }));
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function jitter(min, max, rnd = Math.random) {
  return min + Math.floor(rnd() * (max - min + 1));
}

function defaultFreeSpace(dir) {
  mkdirSync(dir, { recursive: true });
  const s = statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}

function treeBytes(dir) {
  if (!existsSync(dir)) return 0;
  try {
    const st = statSync(dir);
    if (st.isFile()) return st.size;
    let n = 0;
    for (const name of readdirSync(dir)) n += treeBytes(join(dir, name));
    return n;
  } catch {
    return 0;
  }
}

export function estimateNeed(lectures, chapterDir) {
  let n = 0;
  for (const row of lectures) {
    if (row.status === "done") continue;
    const dest = join(chapterDir, row.dir);
    const already = treeBytes(dest) + treeBytes(`${dest}.partial`);
    n += Math.max(0, estimateLectureBytes(row.durationMs) - already);
  }
  return n;
}

function writeJsonAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}

function summary(saved) {
  const counts = { done: 0, archived: 0, failed: 0, pending: 0 };
  for (const l of saved.lectures) counts[l.status] += 1;
  return counts;
}

function exitFrom(counts, stopped, limited) {
  const stillNeed = counts.pending > 0;
  if (stopped) return EXIT.forbidden;
  if (limited && stillNeed && !counts.failed) return EXIT.limit;
  if (counts.failed) return EXIT.error;
  if (counts.archived && !counts.pending) return EXIT.archived;
  if (limited && stillNeed) return EXIT.limit;
  if (counts.pending) return EXIT.error;
  return EXIT.ok;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
}

function manifestId(dir) {
  const man = readJson(join(dir, "manifest.json"));
  return typeof man?.lessonId === "string" ? man.lessonId : null;
}

function moveIfFree(src, dest, log) {
  if (!existsSync(src) || src === dest) return false;
  if (existsSync(dest)) {
    log?.warn?.(`keep both ${src} and ${dest}`);
    return false;
  }
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(src, dest);
  log?.info?.(`moved ${src} → ${dest}`);
  return true;
}

export function migrateOldLayout({ root, chapterDir, courseDir, chapter, lectures, log }) {
  const oldChapter = join(root, `chapter-${chapterFileSlug(chapter.chapterTitle, chapter.chapterId)}`);
  if (existsSync(oldChapter) && oldChapter !== chapterDir) {
    if (!existsSync(chapterDir)) {
      mkdirSync(dirname(chapterDir), { recursive: true });
      renameSync(oldChapter, chapterDir);
      log?.info?.(`moved ${oldChapter} → ${chapterDir}`);
    } else {
      for (const name of listDirs(oldChapter)) {
        moveIfFree(join(oldChapter, name), join(chapterDir, name), log);
      }
    }
  }
  const search = [chapterDir, courseDir, root].filter(Boolean);
  const taken = new Set(lectures.map((l) => l.dir));
  for (const row of lectures) {
    let dest = join(chapterDir, row.dir);
    if (existsSync(join(dest, "manifest.json"))) {
      const id = manifestId(dest);
      if (id === row.lessonId) continue;
      const next = uniqueName(row.dir, taken);
      taken.add(next);
      row.dir = next;
      dest = join(chapterDir, next);
      log?.warn?.(`keep both ${dest} and existing folder; using ${next}`);
    }
    const names = [
      lectureDirName(row.order, row.lessonId),
      `lecture-${row.lessonId}`,
      `${row.dir}.partial`,
    ];
    let moved = false;
    for (const base of search) {
      for (const name of names) {
        const src = join(base, name);
        if (existsSync(join(src, "manifest.json")) && manifestId(src) === row.lessonId) {
          moved = moveIfFree(src, dest, log);
          if (moved) break;
        }
        const part = `${src}.partial`;
        if (existsSync(part) && !existsSync(`${dest}.partial`)) {
          moveIfFree(part, `${dest}.partial`, log);
        }
      }
      if (moved) break;
      for (const name of listDirs(base)) {
        if (!isOldLectureFolder(name) && !isOldChapterFolder(name)) continue;
        const src = join(base, name);
        if (manifestId(src) === row.lessonId) {
          moved = moveIfFree(src, dest, log);
          if (moved) break;
        }
      }
      if (moved) break;
    }
  }
}

export function resolveCourseDir(root, courseTitle, courseId) {
  const base = courseFolderName(courseTitle);
  const taken = new Set(listDirs(root));
  const candidate = join(root, base);
  if (existsSync(candidate)) {
    const courseJson = readJson(join(candidate, "course.json"));
    if (courseJson?.courseId === courseId) return { dir: candidate, name: base };
    const chapterJson = readJson(join(candidate, "chapter.json"));
    if (chapterJson?.courseId === courseId) return { dir: candidate, name: base };
    for (const name of listDirs(candidate)) {
      const nested = readJson(join(candidate, name, "chapter.json"));
      if (nested?.courseId === courseId) return { dir: candidate, name: base };
    }
    const name = uniqueName(base, taken);
    return { dir: join(root, name), name };
  }
  return { dir: candidate, name: base };
}

export function parseChapterArgs(argv) {
  const args = argv.map((a) => String(a ?? "").replace(/^\[+/, "").replace(/\]+$/, "").trim()).filter(Boolean);
  const opts = {
    file: null,
    out: "./saved",
    remux: false,
    noMedia: false,
    noNotes: false,
    dryRun: false,
    retryArchived: false,
    maxLectures: RUN_MAX_DEFAULT,
    verify: null,
  };
  const usage = `usage:
  npm run save-chapter -- ./chapter-week-2.json --out ./saved
  npm run save-chapter -- ./chapter-week-2.json --dry-run
  npm run save-chapter -- --verify ./saved/ChemicalBonding/01_Week2

One chapter per run. Lectures save one at a time. HTTP 403/429 stop the queue.
Exit: 0 all done, 1 some failed, 3 archived only, 4 stopped by 403/429, 5 limit reached.`;
  while (args.length) {
    const a = args.shift();
    if (a === "--help" || a === "-h") return { error: usage, code: EXIT.args };
    if (a === "--verify") opts.verify = args.shift() || null;
    else if (a === "--out") opts.out = args.shift() || "./saved";
    else if (a === "--remux") opts.remux = true;
    else if (a === "--no-media") opts.noMedia = true;
    else if (a === "--no-notes") opts.noNotes = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--retry-archived") opts.retryArchived = true;
    else if (a === "--max-lectures") opts.maxLectures = Math.min(RUN_MAX_HARD, Math.max(1, Number(args.shift()) || RUN_MAX_DEFAULT));
    else if (a?.startsWith("-")) return { error: `unknown flag ${a}\n${usage}`, code: EXIT.args };
    else if (!opts.file) opts.file = a;
    else return { error: `unexpected argument ${a}\n${usage}`, code: EXIT.args };
  }
  if (opts.verify) return { verify: opts.verify };
  if (!opts.file) return { error: usage, code: EXIT.args };
  return opts;
}

export async function verifyChapterFolder(dir, log = defaultLog()) {
  const path = join(dir, "chapter.json");
  if (!existsSync(path)) {
    log.error("FAIL  chapter.json  missing");
    return { ok: false, exit: EXIT.error };
  }
  let saved;
  try {
    saved = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    log.error(`FAIL  chapter.json  ${err instanceof Error ? err.message : err}`);
    return { ok: false, exit: EXIT.error };
  }
  let failed = 0;
  for (const row of saved.lectures || []) {
    const dest = join(dir, row.dir);
    if (row.status !== "done") {
      log.info(`SKIP  ${row.dir}  ${row.status}`);
      continue;
    }
    const v = await verifyBundle(dest, { info: () => {}, warn: () => {}, error: () => {} });
    if (v.ok) log.info(`PASS  ${row.dir}`);
    else {
      failed += 1;
      log.error(`FAIL  ${row.dir}`);
    }
  }
  log.info(failed ? `FAIL  ${failed} lecture(s)` : "PASS  chapter");
  return { ok: !failed, exit: failed ? EXIT.error : EXIT.ok };
}

export async function saveChapter({
  chapter: raw,
  outDir,
  fetch: fetchImpl,
  log,
  opts = {},
  saveOne,
  sleep: sleepFn,
  now,
  freeSpace,
  random,
  shouldStop,
  signal,
}) {
  const logger = log || defaultLog();
  const chapter = validateChapter(raw, opts.maxChapterLectures || 30);
  const root = resolve(outDir || "./saved");
  const course = opts.courseDir
    ? { dir: opts.courseDir, name: opts.courseFolderName || courseFolderName(chapter.courseTitle) }
    : resolveCourseDir(root, chapter.courseTitle, chapter.courseId);
  const chapterName =
    opts.chapterFolder ||
    chapterFolderName(opts.chapterIndex || 1, chapter.chapterTitle, opts.chapterTotal || 1);
  const chapterDir = opts.chapterDir || join(course.dir, chapterName);
  const jsonPath = join(chapterDir, "chapter.json");

  const assigned = assignLectureDirs(chapter.lectures);
  const saved = {
    format: CHAPTER_SAVED_FORMAT,
    version: CHAPTER_VERSION,
    courseId: chapter.courseId,
    courseTitle: chapter.courseTitle,
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    createdAt: chapter.createdAt,
    lectures: assigned,
  };
  if (!opts.dryRun && existsSync(jsonPath)) {
    try {
      const prev = JSON.parse(readFileSync(jsonPath, "utf8"));
      if (prev?.format === CHAPTER_SAVED_FORMAT && Array.isArray(prev.lectures)) {
        const byId = new Map(prev.lectures.map((l) => [l.lessonId, l]));
        saved.lectures = saved.lectures.map((l) => {
          const old = byId.get(l.lessonId);
          return old ? { ...l, status: old.status, error: old.error, dir: old.dir || l.dir } : l;
        });
      }
    } catch {
      /* start fresh */
    }
  }

  const saveFn = saveOne || saveLecture;
  const pause = sleepFn || sleep;
  const stamp = now || (() => new Date());
  const rnd = random || Math.random;
  const verifyFn = opts.verifyFn || quickVerifyBundle;
  const writeState = () => {
    if (opts.dryRun) return;
    writeJsonAtomic(jsonPath, saved);
  };
  const report = () => {
    const counts = summary(saved);
    if (!opts.dryRun) {
      writeJsonAtomic(join(chapterDir, "report.json"), {
        at: stamp().toISOString(),
        folder: chapterDir,
        ...counts,
        lectures: saved.lectures.map((l) => ({
          order: l.order,
          lessonId: l.lessonId,
          title: l.title,
          status: l.status,
          dir: l.dir,
          error: l.error || "",
        })),
      });
    }
    logger.info(
      `done ${counts.done} · archived ${counts.archived} · failed ${counts.failed} · pending ${counts.pending}`,
    );
    return counts;
  };

  if (opts.dryRun) {
    const hours = formatPlanHours(saved.lectures.reduce((n, l) => n + l.durationMs, 0));
    const dur = formatChapterDuration(saved.lectures.reduce((n, l) => n + l.durationMs, 0));
    const mb = Math.ceil(estimatePlanBytes(saved.lectures) / (1024 * 1024));
    for (const l of saved.lectures) {
      logger.info(`${chapterName}/${l.dir}`);
    }
    logger.info(`${saved.lectures.length} lectures · ${dur} (${hours}) · ~${mb} MB`);
    return { dir: chapterDir, saved, exit: EXIT.ok, downloaded: 0 };
  }

  mkdirSync(chapterDir, { recursive: true });
  migrateOldLayout({
    root,
    chapterDir,
    courseDir: course.dir,
    chapter,
    lectures: saved.lectures,
    log: logger,
  });

  const spaceFn = freeSpace || (() => defaultFreeSpace(chapterDir));
  const need = estimateNeed(saved.lectures, chapterDir);
  const free = await spaceFn(chapterDir);
  if (typeof free === "number" && free < need) {
    throw new SaveLectureError(
      `Not enough disk space (need ~${Math.ceil(need / (1024 * 1024))} MB, have ~${Math.floor(free / (1024 * 1024))} MB)`,
      EXIT.error,
    );
  }

  let stopped = false;
  let limited = false;
  let aborted = false;
  let inFlight = 0;
  let downloaded = 0;
  const total = saved.lectures.length;
  const budget = typeof opts.maxLectures === "number" ? opts.maxLectures : RUN_MAX_DEFAULT;
  const onLecture = opts.onLecture;

  writeState();

  for (let i = 0; i < saved.lectures.length; i++) {
    if (shouldStop?.() || signal?.aborted) {
      aborted = true;
      break;
    }
    const row = saved.lectures[i];
    const dest = join(chapterDir, row.dir);
    if (row.status === "archived" && !opts.retryArchived) {
      logger.info(`[${i + 1}/${total}] ${row.title}  archived (skip)`);
      continue;
    }
    {
      const v = await verifyFn(dest, { info: () => {}, warn: () => {}, error: () => {} });
      if (v.ok) {
        if (row.status !== "done") {
          row.status = "done";
          delete row.error;
          writeState();
        }
        logger.info(`[${i + 1}/${total}] ${row.title}  already saved`);
        continue;
      }
    }
    if (downloaded >= budget) {
      limited = saved.lectures.slice(i).some((l) => lectureNeedsDownload(l, opts));
      if (limited) logger.info(`limit reached (${budget}). Re-run the same command to continue.`);
      break;
    }

    const tag = opts.progressTag ? `${opts.progressTag} ` : "";
    logger.info(`${tag}[${i + 1}/${total}] ${row.title}`);
    inFlight += 1;
    if (inFlight > 1) throw new Error("chapter saver must be sequential");
    const attempt = async () =>
      saveFn({
        id: row.lessonId,
        outDir: chapterDir,
        fetch: fetchImpl,
        log: logger,
        opts: {
          title: row.title,
          remux: opts.remux,
          noMedia: opts.noMedia,
          noNotes: opts.noNotes,
          dirName: row.dir,
          signal,
        },
      });
    try {
      await attempt();
      row.status = "done";
      delete row.error;
      downloaded += 1;
    } catch (err) {
      if (isStoppedError(err) || signal?.aborted) {
        row.status = "pending";
        row.error = "Stopped";
        aborted = true;
        inFlight -= 1;
        writeState();
        const counts = report();
        return { dir: chapterDir, saved, exit: EXIT.error, downloaded, aborted: true, counts };
      }
      const code = err instanceof SaveLectureError ? err.code : EXIT.error;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === EXIT.forbidden) {
        row.status = "pending";
        row.error = msg;
        stopped = true;
        saved.lectures.slice(i + 1).forEach((l) => {
          if (l.status !== "done") l.status = "pending";
        });
        logger.error(`${msg}. Stopped. Remaining lectures were not attempted.`);
        inFlight -= 1;
        writeState();
        const counts = report();
        return { dir: chapterDir, saved, exit: exitFrom(counts, true, false), downloaded, stopped: true };
      }
      if (code === EXIT.archived) {
        row.status = "archived";
        row.error = msg;
        logger.warn(`ARCHIVED, skipped: ${row.title}`);
      } else {
        const wait = jitter(RETRY_MIN_MS, RETRY_MAX_MS, rnd);
        logger.warn(`retry ${row.title} in ${(wait / 1000).toFixed(0)}s`);
        await pause(wait, signal);
        try {
          await attempt();
          row.status = "done";
          delete row.error;
          downloaded += 1;
        } catch (err2) {
          if (isStoppedError(err2) || signal?.aborted) {
            row.status = "pending";
            row.error = "Stopped";
            aborted = true;
            inFlight -= 1;
            writeState();
            report();
            return { dir: chapterDir, saved, exit: EXIT.error, downloaded, aborted: true };
          }
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          const code2 = err2 instanceof SaveLectureError ? err2.code : EXIT.error;
          if (code2 === EXIT.forbidden) {
            row.status = "pending";
            row.error = msg2;
            stopped = true;
            saved.lectures.slice(i + 1).forEach((l) => {
              if (l.status !== "done") l.status = "pending";
            });
            inFlight -= 1;
            writeState();
            const counts = report();
            return { dir: chapterDir, saved, exit: exitFrom(counts, true, false), downloaded, stopped: true };
          }
          if (code2 === EXIT.archived) {
            row.status = "archived";
            row.error = msg2;
          } else {
            row.status = "failed";
            row.error = msg2;
            logger.warn(`failed: ${row.title} (${msg2})`);
          }
        }
      }
    }
    inFlight -= 1;
    writeState();
    onLecture?.(saved, row);
    const downloadedThis = row.status === "done";
    let laterNeed = false;
    if (downloadedThis && !shouldStop?.() && !signal?.aborted) {
      for (let j = i + 1; j < saved.lectures.length; j++) {
        const next = saved.lectures[j];
        if (!lectureNeedsDownload(next, opts)) continue;
        const peek = await verifyFn(join(chapterDir, next.dir), { info: () => {}, warn: () => {}, error: () => {} });
        if (!peek.ok) {
          laterNeed = true;
          break;
        }
      }
    }
    if (downloadedThis && laterNeed) {
      await pause(jitter(PAUSE_MIN_MS, PAUSE_MAX_MS, rnd), signal);
    }
  }

  writeState();
  const counts = report();
  limited = limited && saved.lectures.some((l) => lectureNeedsDownload(l, opts));
  return {
    dir: chapterDir,
    saved,
    exit: aborted ? EXIT.error : exitFrom(counts, stopped, limited),
    downloaded,
    aborted,
    limited,
    courseDir: course.dir,
    chapterFolder: chapterName,
  };
}
