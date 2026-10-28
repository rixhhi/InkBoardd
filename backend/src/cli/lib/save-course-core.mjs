/**
 * Save one course by calling saveChapter once per week, in order.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { statfsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assignLectureDirs,
  chapterFolderName,
  courseFolderName,
  estimateLectureBytes,
  estimatePlanBytes,
  formatChapterDuration,
  formatPlanHours,
  lectureNeedsDownload,
  uniqueName,
} from "@inkboard/shared/bundle/chapter";
import {
  COURSE_SAVED_FORMAT,
  COURSE_VERSION,
  chapterAsInkboardChapter,
  clampRunBudget,
  courseLectureCount,
  validateCourse,
} from "@inkboard/shared/bundle/course";
import { EXIT, SaveLectureError, estimateNeed, resolveCourseDir, saveChapter, verifyChapterFolder } from "./save-chapter-core.mjs";
import { verifyBundle } from "./save-lecture-core.mjs";

const CHAPTER_PAUSE_MIN = 20_000;
const CHAPTER_PAUSE_MAX = 40_000;

export { EXIT, SaveLectureError };

function defaultLog() {
  return {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m) => console.error(m),
    progress: (m) => process.stdout.write(`\r${m}`),
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

function writeJsonAtomic(path, data) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}

export function parseCourseArgs(argv) {
  const args = argv.map((a) => String(a ?? "").replace(/^\[+/, "").replace(/\]+$/, "").trim()).filter(Boolean);
  const opts = {
    file: null,
    out: "./saved",
    remux: false,
    noMedia: false,
    noNotes: false,
    dryRun: false,
    retryArchived: false,
    maxLectures: 30,
    onlyChapter: null,
    verify: null,
  };
  const usage = `usage:
  npm run save-course -- ./course-bonding.json --out ./saved
  npm run save-course -- ./course-bonding.json --max-lectures 30 --only-chapter "Week 3"
  npm run save-course -- --verify ./saved/ChemicalBonding

One course per run. Lectures save one at a time. HTTP 403/429 stop the queue.
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
    else if (a === "--only-chapter") opts.onlyChapter = args.shift() || null;
    else if (a === "--max-lectures") opts.maxLectures = clampRunBudget(Number(args.shift()));
    else if (a?.startsWith("-")) return { error: `unknown flag ${a}\n${usage}`, code: EXIT.args };
    else if (!opts.file) opts.file = a;
    else return { error: `unexpected argument ${a}\n${usage}`, code: EXIT.args };
  }
  if (opts.verify) return { verify: opts.verify };
  if (!opts.file) return { error: usage, code: EXIT.args };
  return opts;
}

function seedSaved(course, chapterNames) {
  return {
    format: COURSE_SAVED_FORMAT,
    version: COURSE_VERSION,
    courseId: course.courseId,
    courseTitle: course.courseTitle,
    createdAt: course.createdAt,
    chapters: course.chapters.map((ch, i) => ({
      ...ch,
      dir: chapterNames[i],
      status: "pending",
      lectures: assignLectureDirs(ch.lectures),
    })),
  };
}

function mergePrev(saved, prev) {
  if (!prev?.chapters) return saved;
  const byId = new Map(prev.chapters.map((c) => [c.chapterId, c]));
  saved.chapters = saved.chapters.map((ch) => {
    const old = byId.get(ch.chapterId);
    if (!old) return ch;
    const lecBy = new Map((old.lectures || []).map((l) => [l.lessonId, l]));
    return {
      ...ch,
      dir: old.dir || ch.dir,
      status: old.status || ch.status,
      lectures: ch.lectures.map((l) => {
        const o = lecBy.get(l.lessonId);
        return o ? { ...l, dir: o.dir || l.dir, status: o.status, error: o.error } : l;
      }),
    };
  });
  return saved;
}

function countsOf(saved) {
  const lectures = saved.chapters.flatMap((c) => c.lectures);
  return {
    done: lectures.filter((l) => l.status === "done").length,
    archived: lectures.filter((l) => l.status === "archived").length,
    failed: lectures.filter((l) => l.status === "failed").length,
    pending: lectures.filter((l) => l.status === "pending").length,
    total: lectures.length,
  };
}

function stillNeedDownload(saved, opts = {}) {
  return saved.chapters.some((ch) => ch.lectures.some((l) => lectureNeedsDownload(l, opts)));
}

function chapterWillDownload(ch, opts = {}) {
  return ch.lectures.some((l) => lectureNeedsDownload(l, opts));
}

function exitFrom(counts, stopped, limited) {
  if (stopped) return EXIT.forbidden;
  if (limited && counts.pending > 0 && !counts.failed) return EXIT.limit;
  if (counts.failed) return EXIT.error;
  if (counts.archived && !counts.pending) return EXIT.archived;
  if (limited && counts.pending > 0) return EXIT.limit;
  if (counts.pending) return EXIT.error;
  return EXIT.ok;
}

export async function verifyCourseFolder(dir, log = defaultLog()) {
  const path = join(dir, "course.json");
  if (!existsSync(path)) {
    log.error("FAIL  course.json  missing");
    return { ok: false, exit: EXIT.error };
  }
  const saved = JSON.parse(readFileSync(path, "utf8"));
  let failed = 0;
  let passed = 0;
  for (const ch of saved.chapters || []) {
    for (const row of ch.lectures || []) {
      const dest = join(dir, ch.dir, row.dir);
      if (row.status !== "done") {
        log.info(`SKIP  ${ch.dir}/${row.dir}  ${row.status}`);
        continue;
      }
      const v = await verifyBundle(dest, { info: () => {}, warn: () => {}, error: () => {} });
      if (v.ok) {
        passed += 1;
        log.info(`PASS  ${ch.dir}/${row.dir}`);
      } else {
        failed += 1;
        log.error(`FAIL  ${ch.dir}/${row.dir}`);
      }
    }
  }
  log.info(failed ? `FAIL  ${failed} lecture(s)` : `PASS  ${passed} lecture(s)`);
  return { ok: !failed, exit: failed ? EXIT.error : EXIT.ok };
}

export async function saveCourse({
  course: raw,
  outDir,
  fetch: fetchImpl,
  log,
  opts = {},
  saveOneChapter,
  sleep: sleepFn,
  now,
  freeSpace,
  random,
  signal,
  shouldStop,
}) {
  const logger = log || defaultLog();
  const course = validateCourse(raw);
  const root = resolve(outDir || "./saved");
  const resolved = opts.courseDir
    ? { dir: opts.courseDir, name: opts.courseFolder || courseFolderName(course.courseTitle) }
    : resolveCourseDir(root, course.courseTitle, course.courseId);
  const courseName = resolved.name;
  void courseName;
  const courseDir = resolved.dir;
  const totalCh = course.chapters.length;
  const chapterNames = [];
  const taken = new Set();
  for (let i = 0; i < course.chapters.length; i++) {
    const name = uniqueName(chapterFolderName(course.chapters[i].order, course.chapters[i].chapterTitle, totalCh), taken);
    taken.add(name);
    chapterNames.push(name);
  }

  let saved = seedSaved(course, chapterNames);
  const jsonPath = join(courseDir, "course.json");
  if (!opts.dryRun && existsSync(jsonPath)) {
    try {
      saved = mergePrev(saved, JSON.parse(readFileSync(jsonPath, "utf8")));
    } catch {
      /* fresh */
    }
  }

  const pause = sleepFn || sleep;
  const rnd = random || Math.random;
  const stamp = now || (() => new Date());
  const chapterFn = saveOneChapter || saveChapter;
  const only = opts.onlyChapter ? String(opts.onlyChapter).toLowerCase() : null;
  const spaceFn = freeSpace || ((dir) => defaultFreeSpace(dir));

  const writeState = () => {
    if (opts.dryRun) return;
    mkdirSync(courseDir, { recursive: true });
    writeJsonAtomic(jsonPath, saved);
  };
  const report = () => {
    const counts = countsOf(saved);
    if (!opts.dryRun) {
      mkdirSync(courseDir, { recursive: true });
      writeJsonAtomic(join(courseDir, "report.json"), {
        at: stamp().toISOString(),
        folder: courseDir,
        ...counts,
        lectures: saved.chapters.flatMap((ch) =>
          ch.lectures.map((l) => ({
            chapter: ch.chapterTitle,
            order: l.order,
            lessonId: l.lessonId,
            title: l.title,
            status: l.status,
            dir: l.dir,
            error: l.error || "",
          })),
        ),
      });
    }
    logger.info(
      `done ${counts.done} · archived ${counts.archived} · failed ${counts.failed} · pending ${counts.pending}`,
    );
    return counts;
  };

  const visible = saved.chapters.filter(
    (ch) => !only || ch.chapterTitle.toLowerCase() === only || ch.chapterId.toLowerCase() === only,
  );

  if (opts.dryRun) {
    const lectures = visible.flatMap((ch) => ch.lectures);
    const ms = lectures.reduce((n, l) => n + l.durationMs, 0);
    const mb = Math.ceil(estimatePlanBytes(lectures) / (1024 * 1024));
    for (const ch of visible) {
      for (const l of ch.lectures) logger.info(`${ch.dir}/${l.dir}`);
    }
    logger.info(`${lectures.length} lectures · ${formatChapterDuration(ms)} (${formatPlanHours(ms)}) · ~${mb} MB`);
    return { dir: courseDir, saved, exit: EXIT.ok, downloaded: 0 };
  }

  mkdirSync(courseDir, { recursive: true });

  const remaining = saved.chapters.flatMap((c) => c.lectures).filter((l) => lectureNeedsDownload(l, opts));
  const need = remaining.reduce((n, l) => n + estimateLectureBytes(l.durationMs), 0);
  const free = await spaceFn(courseDir);
  if (typeof free === "number" && free < need) {
    throw new SaveLectureError(
      `Not enough disk space (need ~${Math.ceil(need / (1024 * 1024))} MB, have ~${Math.floor(free / (1024 * 1024))} MB)`,
      EXIT.error,
    );
  }

  writeState();
  let budget = clampRunBudget(opts.maxLectures ?? 30);
  let downloaded = 0;
  let overall = 0;
  const overallTotal = courseLectureCount(course);
  let inFlight = 0;
  let stopped = false;
  let limited = false;

  for (let i = 0; i < saved.chapters.length; i++) {
    if (shouldStop?.() || signal?.aborted) break;
    const ch = saved.chapters[i];
    if (only && ch.chapterTitle.toLowerCase() !== only && ch.chapterId.toLowerCase() !== only) continue;
    if (budget <= 0) {
      limited = stillNeedDownload(saved, opts);
      break;
    }
    inFlight += 1;
    if (inFlight > 1) throw new Error("course saver must be sequential");
    const ink = chapterAsInkboardChapter(course, {
      chapterId: ch.chapterId,
      chapterTitle: ch.chapterTitle,
      order: ch.order,
      lectures: ch.lectures.map(({ dir: _d, status: _s, error: _e, ...l }) => l),
    });
    const result = await chapterFn({
      chapter: ink,
      outDir: root,
      fetch: fetchImpl,
      log: logger,
      saveOne: opts.saveOne,
      sleep: pause,
      now: stamp,
      freeSpace,
      random: rnd,
      signal,
      shouldStop,
      opts: {
        remux: opts.remux,
        noMedia: opts.noMedia,
        noNotes: opts.noNotes,
        retryArchived: opts.retryArchived,
        verifyFn: opts.verifyFn,
        maxLectures: budget,
        maxChapterLectures: 60,
        courseDir,
        chapterDir: join(courseDir, ch.dir),
        chapterFolder: ch.dir,
        chapterIndex: ch.order,
        chapterTotal: totalCh,
        progressTag: `[${ch.chapterTitle} ·`,
        onLecture: (chapterSaved) => {
          ch.lectures = chapterSaved.lectures;
          ch.status = chapterSaved.lectures.every((l) => l.status === "done")
            ? "done"
            : chapterSaved.lectures.some((l) => l.status === "failed")
              ? "failed"
              : "pending";
          writeState();
        },
      },
    });
    inFlight -= 1;
    ch.lectures = result.saved.lectures;
    ch.status = result.saved.lectures.every((l) => l.status === "done")
      ? "done"
      : result.stopped
        ? "pending"
        : result.saved.lectures.some((l) => l.status === "failed")
          ? "failed"
          : result.saved.lectures.every((l) => l.status === "archived" || l.status === "done")
            ? "archived"
            : "pending";
    downloaded += result.downloaded || 0;
    budget -= result.downloaded || 0;
    overall += result.downloaded || 0;
    writeState();
    if (result.stopped || result.exit === EXIT.forbidden) {
      stopped = true;
      logger.error("Stopped by 403/429. Remaining lectures were not attempted.");
      break;
    }
    if (result.aborted || signal?.aborted) {
      report();
      return { dir: courseDir, saved, exit: EXIT.error, downloaded, aborted: true };
    }
    if (result.limited || result.exit === EXIT.limit || budget <= 0) {
      limited = stillNeedDownload(saved, opts);
      if (limited) logger.info(`limit reached, re-run the same command to continue (${overall}/${overallTotal} overall)`);
      break;
    }
    const later = saved.chapters.slice(i + 1).filter((c) => {
      if (only && c.chapterTitle.toLowerCase() !== only && c.chapterId.toLowerCase() !== only) return false;
      return chapterWillDownload(c, opts);
    });
    if ((result.downloaded || 0) > 0 && later.length && !shouldStop?.() && !signal?.aborted) {
      await pause(jitter(CHAPTER_PAUSE_MIN, CHAPTER_PAUSE_MAX, rnd), signal);
    }
  }

  const counts = report();
  limited = limited && stillNeedDownload(saved, opts);
  return { dir: courseDir, saved, exit: exitFrom(counts, stopped, limited), downloaded, stopped, limited };
}

void estimateNeed;
void verifyChapterFolder;
void estimateLectureBytes;
