import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { COURSE_FORMAT } from "@inkboard/shared/bundle/course";
import { EXIT, SaveLectureError, saveCourse } from "../../src/cli/lib/save-course-core.mjs";

function lec(i) {
  return {
    lessonId: `LESSON${String(i).padStart(2, "0")}ABCDEF`,
    title: `Class ${i}`,
    order: i,
    durationMs: 60_000,
  };
}

function course() {
  return {
    format: COURSE_FORMAT,
    version: 1,
    courseId: "COURSE1",
    courseTitle: "Bonding",
    createdAt: "2026-10-04T00:00:00.000Z",
    chapters: [
      { chapterId: "w1", chapterTitle: "Week 1", order: 1, lectures: [lec(1), lec(2)] },
      { chapterId: "w2", chapterTitle: "Week 2", order: 2, lectures: [lec(3), lec(4)] },
    ],
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

const gb = 10 * 1024 * 1024 * 1024;

describe("saveCourse queue", () => {
  it("runs chapters strictly in order, one lecture at a time", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-seq-"));
    const calls = [];
    let concurrent = 0;
    let max = 0;
    const result = await saveCourse({
      course: course(),
      outDir: dir,
      log: silentLog(),
      sleep: async () => {},
      freeSpace: () => gb,
      opts: {
        verifyFn: async () => ({ ok: false }),
        saveOne: async ({ id }) => {
          concurrent += 1;
          max = Math.max(max, concurrent);
          calls.push(id);
          concurrent -= 1;
          return { dir: "x" };
        },
      },
    });
    assert.equal(max, 1);
    assert.deepEqual(calls, ["LESSON01ABCDEF", "LESSON02ABCDEF", "LESSON03ABCDEF", "LESSON04ABCDEF"]);
    assert.equal(result.exit, EXIT.ok);
    assert.match(result.dir, /Bonding$/);
    const report = JSON.parse(readFileSync(join(result.dir, "report.json"), "utf8"));
    assert.equal(report.lectures.length, 4);
    assert.equal(report.lectures[0].chapter, "Week 1");
    assert.equal(report.lectures[0].lessonId, "LESSON01ABCDEF");
    assert.equal(report.lectures[0].status, "done");
    assert.ok(report.lectures[0].dir);
    assert.equal(report.lectures[2].chapter, "Week 2");
    assert.equal(report.lectures[2].title, "Class 3");
    rmSync(dir, { recursive: true, force: true });
  });

  it("stops the whole course on 429 in chapter 2", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-429-"));
    const calls = [];
    const result = await saveCourse({
      course: course(),
      outDir: dir,
      log: silentLog(),
      sleep: async () => {},
      freeSpace: () => gb,
      opts: {
        verifyFn: async () => ({ ok: false }),
        saveOne: async ({ id }) => {
          calls.push(id);
          if (id.includes("03")) throw new SaveLectureError("HTTP 429", EXIT.forbidden);
          return { dir: "x" };
        },
      },
    });
    assert.equal(result.exit, EXIT.forbidden);
    assert.equal(result.saved.chapters[1].lectures[0].status, "pending");
    assert.equal(result.saved.chapters[1].lectures[1].status, "pending");
    assert.ok(!calls.includes("LESSON04ABCDEF"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips archived and continues (exit 3)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-arch-"));
    const result = await saveCourse({
      course: course(),
      outDir: dir,
      log: silentLog(),
      sleep: async () => {},
      freeSpace: () => gb,
      opts: {
        verifyFn: async () => ({ ok: false }),
        saveOne: async ({ id }) => {
          if (id.includes("02")) throw new SaveLectureError("ARCHIVED", EXIT.archived);
          return { dir: "x" };
        },
      },
    });
    assert.equal(result.exit, EXIT.archived);
    assert.equal(result.saved.chapters[0].lectures[1].status, "archived");
    assert.equal(result.saved.chapters[1].lectures[1].status, "done");
    rmSync(dir, { recursive: true, force: true });
  });

  it("stops at the lecture budget and continues on a second run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-bud-"));
    const first = [];
    const a = await saveCourse({
      course: course(),
      outDir: dir,
      log: silentLog(),
      sleep: async () => {},
      freeSpace: () => gb,
      opts: {
        maxLectures: 2,
        verifyFn: async () => ({ ok: false }),
        saveOne: async ({ id }) => {
          first.push(id);
          return { dir: "x" };
        },
      },
    });
    assert.equal(a.exit, EXIT.limit);
    assert.deepEqual(first, ["LESSON01ABCDEF", "LESSON02ABCDEF"]);
    const second = [];
    const b = await saveCourse({
      course: course(),
      outDir: dir,
      log: silentLog(),
      sleep: async () => {},
      freeSpace: () => gb,
      opts: {
        maxLectures: 30,
        verifyFn: async (dest) => ({ ok: dest.includes("Class1") || dest.includes("Class2") }),
        saveOne: async ({ id }) => {
          second.push(id);
          return { dir: "x" };
        },
      },
    });
    assert.ok(!second.includes("LESSON01ABCDEF"));
    assert.ok(second.includes("LESSON03ABCDEF"));
    assert.equal(b.exit, EXIT.ok);
    rmSync(dir, { recursive: true, force: true });
  });

  it("respects --only-chapter", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-only-"));
    const calls = [];
    await saveCourse({
      course: course(),
      outDir: dir,
      log: silentLog(),
      sleep: async () => {},
      freeSpace: () => gb,
      opts: {
        onlyChapter: "Week 2",
        verifyFn: async () => ({ ok: false }),
        saveOne: async ({ id }) => {
          calls.push(id);
          return { dir: "x" };
        },
      },
    });
    assert.deepEqual(calls, ["LESSON03ABCDEF", "LESSON04ABCDEF"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("dry-run writes nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-dry-"));
    const log = silentLog();
    await saveCourse({
      course: course(),
      outDir: dir,
      log,
      sleep: async () => {},
      freeSpace: () => gb,
      opts: { dryRun: true, saveOne: async () => ({ dir: "x" }) },
    });
    assert.equal(existsSync(join(dir, "Bonding")), false);
    assert.ok(log.lines.some((l) => /01_Week1\/01_Class1/.test(l)));
    assert.ok(log.lines.some((l) => /4 lectures/.test(l) && /MB/.test(l)));
    rmSync(dir, { recursive: true, force: true });
  });

  it("exit 0 when the budget lands on the last needed lecture", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-last-"));
    const a = await saveCourse({
      course: course(),
      outDir: dir,
      log: silentLog(),
      sleep: async () => {},
      freeSpace: () => gb,
      opts: {
        maxLectures: 4,
        verifyFn: async () => ({ ok: false }),
        saveOne: async () => ({ dir: "x" }),
      },
    });
    assert.equal(a.exit, EXIT.ok);
    assert.equal(a.limited, false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not pause between chapters when nothing was downloaded", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-nopause-"));
    const sleeps = [];
    await saveCourse({
      course: course(),
      outDir: dir,
      log: silentLog(),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      freeSpace: () => gb,
      opts: {
        verifyFn: async () => ({ ok: true }),
        saveOne: async () => ({ dir: "x" }),
      },
    });
    assert.equal(sleeps.filter((ms) => ms >= 20_000).length, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("pauses between chapters only when both sides download", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-chpause-"));
    const sleeps = [];
    await saveCourse({
      course: course(),
      outDir: dir,
      log: silentLog(),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      freeSpace: () => gb,
      opts: {
        verifyFn: async () => ({ ok: false }),
        saveOne: async () => ({ dir: "x" }),
      },
    });
    assert.equal(sleeps.filter((ms) => ms >= 20_000 && ms <= 40_000).length, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("stops before any download when disk is short", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-disk-"));
    const calls = [];
    await assert.rejects(
      saveCourse({
        course: course(),
        outDir: dir,
        log: silentLog(),
        sleep: async () => {},
        freeSpace: () => 1024,
        opts: {
          verifyFn: async () => ({ ok: false }),
          saveOne: async ({ id }) => {
            calls.push(id);
            return { dir: "x" };
          },
        },
      }),
      /disk space/,
    );
    assert.equal(calls.length, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("verify reports PASS for saved lectures", async () => {
    const dir = mkdtempSync(join(tmpdir(), "co-ver-"));
    await saveCourse({
      course: course(),
      outDir: dir,
      log: silentLog(),
      sleep: async () => {},
      freeSpace: () => gb,
      opts: {
        verifyFn: async () => ({ ok: false }),
        saveOne: async () => ({ dir: "x" }),
      },
    });
    const { verifyCourseFolder } = await import("../../src/cli/lib/save-course-core.mjs");
    const log = silentLog();
    const v = await verifyCourseFolder(join(dir, "Bonding"), log);
    assert.equal(v.ok, false);
    assert.ok(log.lines.some((l) => /SKIP/.test(l) || /FAIL/.test(l) || /PASS/.test(l)));
    rmSync(dir, { recursive: true, force: true });
  });
});
