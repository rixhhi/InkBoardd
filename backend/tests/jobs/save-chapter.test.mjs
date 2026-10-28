import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CHAPTER_FORMAT } from "@inkboard/shared/bundle/chapter";
import { EXIT, SaveLectureError, saveChapter } from "../../src/cli/lib/save-chapter-core.mjs";

function chapter(n = 4) {
  return {
    format: CHAPTER_FORMAT,
    version: 1,
    courseId: "COURSE1",
    courseTitle: "Bonding",
    chapterId: "COURSE1-week-1",
    chapterTitle: "Week 1",
    createdAt: "2026-10-04T00:00:00.000Z",
    lectures: Array.from({ length: n }, (_, i) => ({
      lessonId: `LESSON${String(i + 1).padStart(2, "0")}ABCDEF`,
      title: `Class ${i + 1}`,
      order: i + 1,
      durationMs: 60_000,
    })),
  };
}

function silentLog() {
  const lines = [];
  return {
    lines,
    info: (m) => lines.push(String(m)),
    warn: (m) => lines.push(`W ${m}`),
    error: (m) => lines.push(`E ${m}`),
    progress: () => {},
    newline: () => {},
  };
}

function tracker(handler) {
  const calls = [];
  const dirs = [];
  let concurrent = 0;
  let max = 0;
  const saveOne = async ({ id, opts }) => {
    concurrent += 1;
    max = Math.max(max, concurrent);
    calls.push(id);
    dirs.push(opts?.dirName);
    try {
      return await handler({ id, opts, calls });
    } finally {
      concurrent -= 1;
    }
  };
  return { saveOne, calls, dirs, max: () => max };
}

const gb = 10 * 1024 * 1024 * 1024;

describe("saveChapter queue", () => {
  it("runs lectures strictly in order, one at a time, with title folders", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-seq-"));
    const t = tracker(async () => ({ dir: "x" }));
    const result = await saveChapter({
      chapter: chapter(3),
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { noMedia: true, noNotes: true, verifyFn: async () => ({ ok: false }) },
    });
    assert.equal(t.max(), 1);
    assert.deepEqual(t.calls, ["LESSON01ABCDEF", "LESSON02ABCDEF", "LESSON03ABCDEF"]);
    assert.deepEqual(t.dirs, ["01_Class1", "02_Class2", "03_Class3"]);
    assert.equal(result.exit, EXIT.ok);
    assert.match(result.dir, /Bonding[/\\]01_Week1$/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("stops the queue on 429 and leaves the rest pending", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-429-"));
    const t = tracker(async ({ id }) => {
      if (id.endsWith("03ABCDEF")) throw new SaveLectureError("HTTP 429", EXIT.forbidden);
      return { dir: "x" };
    });
    let fetches = 0;
    const result = await saveChapter({
      chapter: chapter(4),
      outDir: dir,
      fetch: async () => {
        fetches += 1;
        return new Response("no", { status: 404 });
      },
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    assert.equal(result.exit, EXIT.forbidden);
    assert.equal(result.saved.lectures[0].status, "done");
    assert.equal(result.saved.lectures[2].status, "pending");
    assert.equal(result.saved.lectures[3].status, "pending");
    assert.equal(t.calls.length, 3);
    assert.equal(fetches, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips an archived lecture and continues (exit 3)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-arch-"));
    const t = tracker(async ({ id }) => {
      if (id.includes("02")) throw new SaveLectureError("ARCHIVED, cannot be saved", EXIT.archived);
      return { dir: "x" };
    });
    const result = await saveChapter({
      chapter: chapter(3),
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    assert.equal(result.exit, EXIT.archived);
    assert.equal(result.saved.lectures[1].status, "archived");
    assert.equal(result.saved.lectures[2].status, "done");
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not re-request archived lectures on re-run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-arch2-"));
    const first = tracker(async ({ id }) => {
      if (id.includes("02")) throw new SaveLectureError("ARCHIVED, cannot be saved", EXIT.archived);
      return { dir: "x" };
    });
    await saveChapter({
      chapter: chapter(3),
      outDir: dir,
      log: silentLog(),
      saveOne: first.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    const second = tracker(async () => ({ dir: "x" }));
    await saveChapter({
      chapter: chapter(3),
      outDir: dir,
      log: silentLog(),
      saveOne: second.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: true }) },
    });
    assert.equal(second.calls.includes("LESSON02ABCDEF"), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("records a failed lecture after a retry wait (exit 1)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-fail-"));
    const waits = [];
    const t = tracker(async ({ id }) => {
      if (id.includes("02")) throw new SaveLectureError("boom", EXIT.error);
      return { dir: "x" };
    });
    const result = await saveChapter({
      chapter: chapter(3),
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async (ms) => {
        waits.push(ms);
      },
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    assert.equal(result.exit, EXIT.error);
    assert.equal(result.saved.lectures[1].status, "failed");
    assert.ok(waits.some((ms) => ms >= 5000 && ms <= 15000));
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips verified bundles on re-run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-skip-"));
    const first = tracker(async () => ({ dir: "x" }));
    await saveChapter({
      chapter: chapter(2),
      outDir: dir,
      log: silentLog(),
      saveOne: first.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    const second = tracker(async () => ({ dir: "x" }));
    await saveChapter({
      chapter: chapter(2),
      outDir: dir,
      log: silentLog(),
      saveOne: second.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: true }) },
    });
    assert.equal(second.calls.length, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("dry-run makes zero save calls and writes nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-dry-"));
    let fetches = 0;
    const t = tracker(async () => ({ dir: "x" }));
    await saveChapter({
      chapter: chapter(2),
      outDir: dir,
      fetch: async () => {
        fetches += 1;
        return new Response("no");
      },
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { dryRun: true },
    });
    assert.equal(t.calls.length, 0);
    assert.equal(fetches, 0);
    assert.equal(existsSync(join(dir, "Bonding")), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("stops before any download when disk is short", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-disk-"));
    const t = tracker(async () => ({ dir: "x" }));
    await assert.rejects(
      saveChapter({
        chapter: chapter(2),
        outDir: dir,
        log: silentLog(),
        saveOne: t.saveOne,
        sleep: async () => {},
        freeSpace: () => 1024,
        opts: { verifyFn: async () => ({ ok: false }) },
      }),
      /disk space/,
    );
    assert.equal(t.calls.length, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rewrites chapter.json after every lecture", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-kill-"));
    let n = 0;
    const t = tracker(async () => {
      n += 1;
      return { dir: "x" };
    });
    await saveChapter({
      chapter: chapter(4),
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      shouldStop: () => n >= 2,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    const saved = JSON.parse(readFileSync(join(dir, "Bonding", "01_Week1", "chapter.json"), "utf8"));
    assert.equal(saved.lectures[0].status, "done");
    assert.equal(saved.lectures[1].status, "done");
    assert.equal(saved.lectures[2].status, "pending");
    rmSync(dir, { recursive: true, force: true });
  });

  it("aborts in-flight work, keeps the partial, and writes the report", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-abort-"));
    const ac = new AbortController();
    const t = tracker(async ({ opts }) => {
      ac.abort();
      if (opts?.signal?.aborted) throw new SaveLectureError("Stopped", EXIT.error, { aborted: true });
      return { dir: "x" };
    });
    const result = await saveChapter({
      chapter: chapter(3),
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      signal: ac.signal,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    assert.equal(result.aborted, true);
    assert.equal(existsSync(join(result.dir, "chapter.json")), true);
    assert.equal(existsSync(join(result.dir, "report.json")), true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("renames an old NNN-lecture folder instead of re-downloading", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-mig-"));
    const oldRoot = join(dir, "chapter-week-1");
    const oldLec = join(oldRoot, "001-lecture-LESSON01ABCDEF");
    mkdirSync(oldLec, { recursive: true });
    writeFileSync(
      join(oldLec, "manifest.json"),
      JSON.stringify({
        format: "inkboard-bundle",
        version: 1,
        lessonId: "LESSON01ABCDEF",
        title: "Class 1",
        kind: "board",
        durationMs: 1000,
        savedAt: "2026-10-04T00:00:00.000Z",
        parserVersion: "v14",
        files: { ink: { path: "ink.json.gz", bytes: 0, sha256: "a" }, media: { path: "media.webm", bytes: 0, sha256: "b" } },
        slides: [],
      }),
    );
    writeFileSync(join(oldLec, "ink.json.gz"), "");
    writeFileSync(join(oldLec, "media.webm"), "");
    const t = tracker(async () => ({ dir: "x" }));
    const result = await saveChapter({
      chapter: chapter(1),
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: true }) },
    });
    assert.equal(existsSync(join(result.dir, "01_Class1", "manifest.json")), true);
    assert.equal(existsSync(oldLec), false);
    assert.equal(t.calls.length, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("namespaces two courses so Week 2 folders do not collide", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-ns-"));
    const t = tracker(async () => ({ dir: "x" }));
    const a = { ...chapter(1), courseTitle: "Bonding", courseId: "AAAAAA" };
    const b = { ...chapter(1), courseTitle: "Mechanics", courseId: "BBBBBB", chapterId: "BB-week-1" };
    const ra = await saveChapter({
      chapter: a,
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    const rb = await saveChapter({
      chapter: b,
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    assert.ok(ra.dir.includes("Bonding"));
    assert.ok(rb.dir.includes("Mechanics"));
    assert.notEqual(ra.dir, rb.dir);
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps both folders when the new name already exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-keep-"));
    const chapterDir = join(dir, "Bonding", "01_Week1");
    const dest = join(chapterDir, "01_Class1");
    const oldLec = join(dir, "001-lecture-LESSON01ABCDEF");
    mkdirSync(dest, { recursive: true });
    writeFileSync(
      join(chapterDir, "chapter.json"),
      JSON.stringify({
        format: "inkboard-chapter-saved",
        version: 1,
        courseId: "COURSE1",
        courseTitle: "Bonding",
        chapterId: "COURSE1-week-1",
        chapterTitle: "Week 1",
        createdAt: "2026-10-04T00:00:00.000Z",
        lectures: [{ lessonId: "LESSON01ABCDEF", title: "Class 1", order: 1, durationMs: 60_000, dir: "01_Class1", status: "pending" }],
      }),
    );
    writeFileSync(join(dest, "manifest.json"), JSON.stringify({ lessonId: "OTHER01ABCDEF" }));
    mkdirSync(oldLec, { recursive: true });
    writeFileSync(
      join(oldLec, "manifest.json"),
      JSON.stringify({
        format: "inkboard-bundle",
        version: 1,
        lessonId: "LESSON01ABCDEF",
        title: "Class 1",
        kind: "board",
        durationMs: 1000,
        savedAt: "2026-10-04T00:00:00.000Z",
        parserVersion: "v14",
        files: { ink: { path: "ink.json.gz", bytes: 0, sha256: "a" }, media: { path: "media.webm", bytes: 0, sha256: "b" } },
        slides: [],
      }),
    );
    const log = silentLog();
    const t = tracker(async () => ({ dir: "x" }));
    const result = await saveChapter({
      chapter: chapter(1),
      outDir: dir,
      log,
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async (d) => ({ ok: String(d).includes("01_Class1_2") }) },
    });
    assert.equal(existsSync(dest), true);
    assert.equal(existsSync(join(result.dir, "01_Class1_2", "manifest.json")), true);
    assert.equal(existsSync(oldLec), false);
    assert.ok(log.lines.some((l) => /keep both/.test(l)));
    rmSync(dir, { recursive: true, force: true });
  });

  it("exit 0 when the budget covers the last remaining lecture", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-last-"));
    const t = tracker(async () => ({ dir: "x" }));
    const result = await saveChapter({
      chapter: chapter(3),
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { maxLectures: 3, verifyFn: async () => ({ ok: false }) },
    });
    assert.equal(result.exit, EXIT.ok);
    assert.equal(result.limited, false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not pause after skipped or archived lectures", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-wait-"));
    const sleeps = [];
    const t = tracker(async () => ({ dir: "x" }));
    await saveChapter({
      chapter: chapter(3),
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      freeSpace: () => gb,
      opts: {
        verifyFn: async (dest) => ({ ok: String(dest).includes("Class1") || String(dest).includes("Class3") }),
      },
    });
    assert.equal(t.calls.length, 1);
    assert.equal(
      sleeps.filter((ms) => ms >= 3000 && ms <= 8000).length,
      0,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("pauses between two real downloads", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-pause-"));
    const sleeps = [];
    const t = tracker(async () => ({ dir: "x" }));
    await saveChapter({
      chapter: chapter(2),
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    assert.equal(sleeps.filter((ms) => ms >= 3000 && ms <= 8000).length, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("dry-run prints folder paths, count, hours, and disk need", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-dry2-"));
    const log = silentLog();
    await saveChapter({
      chapter: chapter(2),
      outDir: dir,
      log,
      saveOne: async () => ({ dir: "x" }),
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { dryRun: true },
    });
    assert.ok(log.lines.some((l) => /01_Week1\/01_Class1/.test(l)));
    assert.ok(log.lines.some((l) => /2 lectures/.test(l) && /MB/.test(l)));
    assert.equal(existsSync(join(dir, "Bonding")), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a Hindi lecture folder name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ch-hi-"));
    const t = tracker(async () => ({ dir: "x" }));
    const ch = chapter(1);
    ch.lectures[0].title = "प्रायिकता सिद्धांत";
    const result = await saveChapter({
      chapter: ch,
      outDir: dir,
      log: silentLog(),
      saveOne: t.saveOne,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { verifyFn: async () => ({ ok: false }) },
    });
    assert.equal(t.dirs[0], "01_प्रायिकतासिद्धांत");
    assert.equal(result.saved.lectures[0].dir, "01_प्रायिकतासिद्धांत");
    rmSync(dir, { recursive: true, force: true });
  });
});
