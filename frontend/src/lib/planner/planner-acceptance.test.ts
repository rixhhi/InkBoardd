import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { generatePlan } from "@inkboard/shared/planner/scheduler";
import { makeIdFactory } from "@inkboard/shared/planner/ids";
import { fillPrefs, fillTask, fillPlan, HARD_MAX_LECTURES, type PlanCourseInput } from "@inkboard/shared/planner/types";
import { dryRunImport, exportPlannerJson, importPlannerBackup, parsePlannerBackup } from "@inkboard/shared/planner/backup";
import { heatmapMove, progressPercent } from "@inkboard/shared/planner/daily";
import { playbackCredit } from "@inkboard/shared/planner/watch";
import { computeStreaks } from "@inkboard/shared/planner/streaks";
import { recordWatchTick, readPlanner, resetPlannerRuntime, setTaskStatus, upsertPlan } from "@inkboard/shared/planner/storage";
import { setPlannerNow } from "@inkboard/shared/planner/dates";
import { sessionsToCsv, type HistoryRow } from "@inkboard/shared/planner/history";
import { importSessions, readSessions, EMPTY_SESSIONS, getServerSessions } from "@inkboard/shared/planner/sessions";
import { importJournal, readJournal, EMPTY_JOURNAL, getServerJournal } from "@inkboard/shared/planner/journal";
import { importBadges, readEarnedBadges, EMPTY_BADGES, getServerBadges } from "@inkboard/shared/planner/badges";
import { mergeSessions, mergeJournal, mergeBadges } from "@inkboard/shared/planner/extras";
import { cacheTodayPlan, readTodayCache } from "@inkboard/shared/planner/offline";
import { createRecoveryPoint, listRecoveryPoints } from "@inkboard/shared/planner/recovery";

function mockStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
    configurable: true,
  });
}

afterEach(() => {
  resetPlannerRuntime();
  delete (globalThis as { localStorage?: unknown }).localStorage;
  setPlannerNow(null);
});

function lesson(id: string, title: string, rank: number, sec = 12 * 60): PlanCourseInput["lessons"][0] {
  return {
    lessonId: id,
    title,
    durationSec: sec,
    rank,
    week: null,
    notesUrl: null,
    dppUrl: null,
    playable: true,
    status: "replay",
  };
}

function course(id: string, title: string, n: number): PlanCourseInput {
  return {
    courseId: id,
    title,
    teacher: "T",
    subject: title,
    lessons: Array.from({ length: n }, (_, i) => lesson(`${id}${i}`, `${title} ${i + 1}`, i)),
  };
}

describe("phase E acceptance", () => {
  it("1 playlist of short lectures never exceeds the chosen pace", () => {
    const { tasks } = generatePlan(fillPrefs({ startDate: "2026-03-02", lecturesPerDay: 3, includeRevision: false, restEvery: 0 }), [
      course("p", "Physics", 30),
    ], { id: makeIdFactory("t") });
    const byDate = new Map<string, number>();
    for (const t of tasks.filter((x) => x.type === "lesson")) {
      byDate.set(t.date, (byDate.get(t.date) ?? 0) + 1);
    }
    for (const [date, n] of byDate) assert.ok(n <= 3, `${date} had ${n}`);
    assert.ok([...byDate.values()].every((n) => n <= HARD_MAX_LECTURES));
  });

  it("4 playlists on steady rotate 3/day and add a +3 revision", () => {
    const courses = [course("P", "Physics", 6), course("C", "Chem", 6), course("M", "Maths", 6), course("B", "Bio", 6)];
    const { tasks } = generatePlan(
      fillPrefs({ startDate: "2026-03-02", lecturesPerDay: 3, playlistMode: "rotate", includeRevision: true, restEvery: 0, catchUpDay: null }),
      courses,
      { id: makeIdFactory("t") },
    );
    const lessons = tasks.filter((t) => t.type === "lesson");
    const day1 = lessons.filter((t) => t.date === "2026-03-02");
    assert.equal(day1.length, 3);
    const coursesOnDay1 = new Set(day1.map((t) => t.courseId));
    assert.equal(coursesOnDay1.size, 3);
    const review = tasks.find((t) => t.type === "revision" && t.date === "2026-03-05");
    assert.ok(review, "day 4 should hold the +3 review of day 1");
    assert.ok((review!.refLessonIds?.length ?? 0) > 0);
  });

  it("seeking to the end neither completes nor credits minutes", () => {
    assert.equal(playbackCredit(0, 2400).creditSec, 0);
  });

  it("catching up an overdue lecture today leaves past days unchanged", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 4, 12, 0, 0));
    upsertPlan({
      id: "p1",
      examId: "YOTUH",
      examName: "NEET",
      name: "NEET",
      prefs: fillPrefs({ startDate: "2026-03-02" }),
      startDate: "2026-03-02",
      endDate: "2026-03-20",
      active: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      deletedAt: null,
      courses: [],
      tasks: [
        fillTask({ id: "old", title: "Old", date: "2026-03-02", lessonId: "L1", durationMin: 40, status: "pending" }),
      ],
    });
    setTaskStatus("p1", "old", "done");
    const s = readPlanner();
    assert.equal(s.plans[0]!.tasks[0]!.status, "done");
    const today = s.days.find((d) => d.date === "2026-03-04");
    assert.ok((today?.tasksDone ?? 0) >= 1);
    assert.equal(s.days.find((d) => d.date === "2026-03-02")?.tasksDone ?? 0, 0);
  });

  it("heatmap arrows stay on the grid and Escape clears", () => {
    const dates = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-09"];
    assert.equal(heatmapMove("2026-03-02", "ArrowDown", dates), "2026-03-03");
    assert.equal(heatmapMove("2026-03-02", "ArrowRight", dates), "2026-03-09");
    assert.equal(heatmapMove("2026-03-02", "ArrowLeft", dates), "2026-03-02");
    assert.equal(heatmapMove("2026-03-02", "Home", dates), "2026-03-02");
    assert.equal(heatmapMove("2026-03-02", "End", dates), "2026-03-09");
    assert.equal(heatmapMove("2026-03-03", "Escape", dates), null);
    assert.equal(progressPercent(45, 90), 50);
    assert.equal(progressPercent(200, 100), 100);
  });

  it("CSV export includes every filtered column", () => {
    const rows: HistoryRow[] = [
      {
        id: "s1",
        date: "2026-03-04",
        startIso: "2026-03-04T10:00:00.000Z",
        durationMin: 40,
        subject: "Physics",
        courseId: "c1",
        taskId: "t1",
        lessonId: "L1",
        notes: "ray, optics",
        source: "manual",
        completed: true,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
        teacher: "AG",
        lecture: "Ray optics",
        plannedDate: "2026-03-03",
        late: true,
      },
    ];
    const csv = sessionsToCsv(rows);
    assert.match(csv, /^date,start,end,subject,teacher,lecture,minutes,completed,source,notes/);
    assert.match(csv, /Ray optics/);
    assert.match(csv, /manual/);
    assert.match(csv, /"ray, optics"/);
  });

  it("backup v2 round-trips sessions, journal and badges; v1 still imports", () => {
    mockStorage();
    upsertPlan({
      id: "p1",
      examId: "YOTUH",
      examName: "NEET",
      name: "NEET",
      prefs: fillPrefs({ startDate: "2026-03-02" }),
      startDate: "2026-03-02",
      endDate: "2026-03-20",
      active: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      deletedAt: null,
      courses: [],
      tasks: [fillTask({ id: "t1", title: "A", date: "2026-03-02" })],
    });
    importSessions([
      {
        id: "s1",
        date: "2026-03-04",
        startIso: "2026-03-04T10:00:00.000Z",
        durationMin: 20,
        subject: "Physics",
        courseId: null,
        taskId: null,
        lessonId: null,
        notes: "ok",
        source: "watch",
        completed: true,
        createdAt: "",
        updatedAt: "2026-03-04T10:00:00.000Z",
        deletedAt: null,
      },
    ]);
    importJournal([
      {
        date: "2026-03-04",
        mood: 4,
        focus: 5,
        summary: "solid",
        wentWell: "",
        wentWrong: "",
        tomorrow: "",
        goals: [],
        updatedAt: "2026-03-04T20:00:00.000Z",
        deletedAt: null,
      },
    ]);
    importBadges([{ id: "first-lecture", earnedAt: "2026-03-04T00:00:00.000Z", updatedAt: "2026-03-04T00:00:00.000Z", deletedAt: null }]);
    const raw = exportPlannerJson();
    const parsedFile = JSON.parse(raw) as { backupVersion: number; sessions: unknown[]; journal: unknown[]; badges: unknown[] };
    assert.equal(parsedFile.backupVersion, 2);
    assert.equal(parsedFile.sessions.length, 1);
    assert.equal(parsedFile.journal.length, 1);
    assert.equal(parsedFile.badges.length, 1);
    const summary = dryRunImport(raw);
    assert.equal(summary.sessions, 1);
    assert.equal(summary.journal, 1);
    assert.equal(summary.badges, 1);

    const v1 = JSON.stringify({
      version: 1,
      plans: [readPlanner().plans[0]],
      activePlanId: "p1",
    });
    assert.equal(parsePlannerBackup(v1).plans[0]!.id, "p1");
    importPlannerBackup(raw, "replace");
    assert.equal(readSessions().length, 1);
    assert.equal(readJournal()[0]!.summary, "solid");
    assert.equal(readEarnedBadges()[0]!.id, "first-lecture");
  });

  it("two-device extras merge keeps the newer row and a deletion", () => {
    const sessions = mergeSessions(
      [{ id: "s1", updatedAt: "2026-03-01T00:00:00.000Z", notes: "a" } as never],
      [{ id: "s1", updatedAt: "2026-03-02T00:00:00.000Z", notes: "b", deletedAt: "2026-03-02T00:00:00.000Z" } as never],
    );
    assert.equal(sessions[0]!.deletedAt, "2026-03-02T00:00:00.000Z");
    const journal = mergeJournal(
      [{ date: "2026-03-01", updatedAt: "2026-03-01T00:00:00.000Z", summary: "old" } as never],
      [{ date: "2026-03-01", updatedAt: "2026-03-03T00:00:00.000Z", summary: "new" } as never],
    );
    assert.equal((journal[0] as { summary: string }).summary, "new");
    const badges = mergeBadges(
      [{ id: "first-lecture", updatedAt: "2026-03-01T00:00:00.000Z" } as never],
      [{ id: "first-lecture", updatedAt: "2026-03-04T00:00:00.000Z" } as never],
    );
    assert.equal(badges[0]!.updatedAt, "2026-03-04T00:00:00.000Z");
  });

  it("a failed watch tick does not rewrite planner JSON", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 4, 12, 0, 0));
    upsertPlan({
      id: "p1",
      examId: "YOTUH",
      examName: "NEET",
      name: "NEET",
      prefs: fillPrefs({ startDate: "2026-03-02" }),
      startDate: "2026-03-02",
      endDate: "2026-03-20",
      active: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      deletedAt: null,
      courses: [],
      tasks: [fillTask({ id: "t1", title: "A", date: "2026-03-04", lessonId: "L1", durationMin: 40 })],
    });
    const before = localStorage.getItem("inkboard.planner.v1");
    recordWatchTick("L1", 0, 2400, false, 2400);
    assert.equal(localStorage.getItem("inkboard.planner.v1"), before);
    assert.equal(readPlanner().plans[0]!.tasks[0]!.status, "pending");
  });

  it("today cache and recovery points exist before a wipe", () => {
    mockStorage();
    const plan = {
      id: "p1",
      examId: "YOTUH",
      examName: "NEET",
      name: "NEET",
      prefs: fillPrefs({ startDate: "2026-03-04" }),
      startDate: "2026-03-04",
      endDate: "2026-03-20",
      active: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      deletedAt: null,
      courses: [],
      tasks: [fillTask({ id: "t1", title: "A", date: "2026-03-04" })],
    };
    upsertPlan(plan);
    cacheTodayPlan(plan, "2026-03-04");
    assert.equal(readTodayCache()?.tasks.length, 1);
    createRecoveryPoint("before reset");
    assert.equal(listRecoveryPoints().length, 1);
  });

  it("streak rest days neither count nor break", () => {
    const days = [
      { date: "2026-03-02", minutesStudied: 30, tasksDone: 1, updatedAt: "" },
      { date: "2026-03-03", minutesStudied: 30, tasksDone: 1, updatedAt: "" },
    ];
    const r = computeStreaks(days, [], [], "2026-03-04", 20, fillPrefs({ studyDays: [1, 2], catchUpDay: null }));
    assert.ok(r.current >= 1);
  });

  it("a numeric lessons field does not crash generatePlan or coverage", () => {
    const broken = {
      courseId: "x",
      title: "Broken",
      teacher: "T",
      subject: "CS",
      lessons: 62 as unknown as PlanCourseInput["lessons"],
    };
    const { tasks, summary } = generatePlan(fillPrefs({ startDate: "2026-03-02", includeRevision: false, restEvery: 0 }), [
      broken,
    ]);
    assert.equal(tasks.filter((t) => t.type === "lesson").length, 0);
    assert.ok(summary.warning);
    const plan = fillPlan({ id: "p", examId: "NVLIA", name: "GATE", courses: [broken] });
    assert.equal(plan.courses[0]!.lessons.length, 0);
  });

  it("session/journal/badge server snapshots stay empty", () => {
    assert.equal(getServerSessions(), EMPTY_SESSIONS);
    assert.equal(getServerJournal(), EMPTY_JOURNAL);
    assert.equal(getServerBadges(), EMPTY_BADGES);
    assert.equal(getServerSessions().length, 0);
  });
});

describe("phase E source contracts", () => {
  it("error UI has Try again, Copy error and a component stack in dev", () => {
    const src = readFileSync(new URL("../../lib/error-component.tsx", import.meta.url), "utf8");
    assert.match(src, /COPY.tryAgain/);
    assert.match(src, /Copy details/);
    assert.match(src, /componentStack/);
    assert.match(src, /data-error-boundary/);
  });

  it("planner shell sits in the app shell, with a skip link", () => {
    const src = readFileSync(new URL("../../components/planner/planner-shell.tsx", import.meta.url), "utf8");
    assert.match(src, /<AppShell>/);
    assert.match(src, /id="planner-main"/);
    assert.match(src, /aria-label="Planner"/);
    assert.match(src, /WidgetErrorBoundary/);
    const skip = readFileSync(new URL("../../components/folio/skip-link.tsx", import.meta.url), "utf8");
    assert.match(skip, /COPY.skipToBoard/);
    assert.match(skip, /href="#main"/);
    const shell = readFileSync(new URL("../../components/shell/app-shell.tsx", import.meta.url), "utf8");
    assert.match(shell, /<SkipLink \/>/);
    assert.match(shell, /<main id="main"/);
    assert.match(shell, /aria-label="Navigation"/);
    const sheet = readFileSync(new URL("../../components/folio/saved-sheet.tsx", import.meta.url), "utf8");
    assert.match(sheet, /LedgerBody/);
  });

  it("month of boards is a grid of miniature days, not a GitHub heatmap", () => {
    const src = readFileSync(new URL("../../components/planner/calendar-page.tsx", import.meta.url), "utf8");
    assert.match(src, /miniBoard/);
    assert.match(src, /monthGrid/);
    assert.match(src, /grid-cols-7/);
    assert.doesNotMatch(src, /heatmapMove/);
  });
});
