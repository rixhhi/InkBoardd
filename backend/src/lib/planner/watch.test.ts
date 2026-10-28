import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { applyWatchTick, playbackCredit, uniqueRatio } from "@inkboard/shared/planner/watch";
import { completeLessonInPlan, recordWatchTick, readPlanner, resetPlannerRuntime, setTaskStatus, upsertPlan } from "@inkboard/shared/planner/storage";
import { setPlannerNow } from "@inkboard/shared/planner/dates";
import { fillPrefs, fillTask, PLANNER_KEY } from "@inkboard/shared/planner/types";
import type { StudyPlan } from "@inkboard/shared/planner/types";

function mockStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: () => null,
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

function plan(): StudyPlan {
  return {
    id: "plan1",
    examId: "YOTUH",
    examName: "NEET UG",
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
      fillTask({
        id: "t1",
        date: "2026-03-01",
        title: "Optics",
        lessonId: "LESSON1",
        durationMin: 40,
      }),
    ],
  };
}

describe("playbackCredit", () => {
  it("ignores seeks larger than 5s and hidden tabs", () => {
    assert.equal(playbackCredit(10, 90).creditSec, 0);
    assert.equal(playbackCredit(10, 12, { hidden: true }).creditSec, 0);
    assert.equal(playbackCredit(10, 12).creditSec, 2);
  });
});

describe("recordWatchTick", () => {
  it("seeking to the end does not credit minutes or complete the lesson", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 4, 12, 0, 0));
    upsertPlan(plan());
    const r = recordWatchTick("LESSON1", 0, 2400, false, 2400);
    assert.equal(r.creditedSec, 0);
    assert.equal(r.autoCompleted, false);
    const s = readPlanner();
    assert.equal(s.plans[0]!.tasks[0]!.status, "pending");
    assert.equal(s.days.find((d) => d.date === "2026-03-04")?.minutesStudied ?? 0, 0);
  });

  it("a playback tick does not rewrite the plan JSON", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 4, 12, 0, 0));
    upsertPlan(plan());
    const before = localStorage.getItem(PLANNER_KEY);
    const r = recordWatchTick("LESSON1", 10, 12, false, 600);
    assert.equal(r.creditedSec, 2);
    assert.equal(localStorage.getItem(PLANNER_KEY), before);
    assert.equal(JSON.parse(before ?? "{}").watchLogs?.length ?? 0, 0);
    assert.ok(readPlanner().watchLogs.some((w) => w.lessonId === "LESSON1" && w.seconds >= 2));
  });

  it("resume mid-lesson accumulates unique coverage", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 4, 12, 0, 0));
    upsertPlan(plan());
    let prev = 100;
    for (let t = 101; t <= 160; t += 1) {
      const r = recordWatchTick("LESSON1", prev, t, false, 600);
      prev = r.nextPrev;
    }
    const log = readPlanner().watchLogs[0]!;
    assert.ok(log.seconds >= 50);
    assert.ok(uniqueRatio(log.ranges, 600) < 0.9);
  });

  it("overdue catch-up credits today, not the scheduled date", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 4, 12, 0, 0));
    upsertPlan(plan());
    setTaskStatus("plan1", "t1", "done", 40);
    const s = readPlanner();
    assert.equal(s.days.find((d) => d.date === "2026-03-04")?.tasksDone, 1);
    assert.equal(s.days.find((d) => d.date === "2026-03-01")?.tasksDone ?? 0, 0);
  });

  it("undoing completion removes today's credit and does not double-count", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 4, 12, 0, 0));
    upsertPlan(plan());
    completeLessonInPlan("LESSON1", "manual");
    completeLessonInPlan("LESSON1", "manual");
    let s = readPlanner();
    assert.equal(s.plans[0]!.tasks[0]!.status, "done");
    assert.equal(s.days.find((d) => d.date === "2026-03-04")?.tasksDone, 1);
    setTaskStatus("plan1", "t1", "pending");
    s = readPlanner();
    assert.equal(s.plans[0]!.tasks[0]!.status, "pending");
    assert.equal(s.days.find((d) => d.date === "2026-03-04")?.tasksDone, 0);
  });
});

describe("applyWatchTick", () => {
  it("does not merge a jump into coverage ranges", () => {
    const a = applyWatchTick(undefined, "L", "2026-03-04", 0, 2, false);
    const b = applyWatchTick(a.log, "L", "2026-03-04", 2, 200, false);
    assert.equal(b.creditSec, 0);
    assert.equal(b.log.ranges.length, 1);
  });
});
