import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { inkItems, planReinks } from "./ink.ts";
import { rateRevision, readPlanner, reinkLesson, replaceState, resetPlannerWorkspace, scheduleReinks, undoLast } from "./storage.ts";
import { setPlannerNow } from "./dates.ts";
import { fillPrefs, fillTask, liveTasks, type PlannerState, type StudyPlan } from "./types.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const TODAY = "2026-10-29";

function plan(): StudyPlan {
  const prefs = fillPrefs({ dailyMinutes: 90, studyDays: [1, 2, 3, 4, 5, 6], catchUpDay: null, examDate: "2026-12-06", revisionIntervals: [1, 3, 7, 21] });
  const lessons = ["A", "B", "C", "D"].map((id, i) => ({ lessonId: id, title: `Lesson ${id}`, rank: i, durationSec: 3600, week: 1 }));
  return {
    id: "p1",
    name: "JEE",
    examId: "jee",
    examName: "JEE",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    startDate: "2026-09-01",
    endDate: "2026-10-30",
    prefs,
    courses: [{ courseId: "c1", title: "Physics", teacher: "T", subject: "Physics", lessons }],
    tasks: lessons.map((l, i) =>
      fillTask({ id: `t${i}`, title: l.title, date: "2026-09-02", type: "lesson", lessonId: l.lessonId, courseId: "c1", durationMin: 60, status: "done", completedAt: "2026-09-02T10:00:00.000Z", orderIdx: i, updatedAt: "2026-09-02T10:00:00.000Z" }),
    ),
    // A was reviewed recently (crisp), B long ago, C and D never reviewed.
    reviews: [
      { lessonId: "A", stage: 2, dueDate: "2026-11-20", lastRating: "solid", lectureDate: "2026-09-02", lectureCompletedOn: "2026-10-28" },
      { lessonId: "B", stage: 1, dueDate: "2026-09-20", lastRating: "ok", lectureDate: "2026-09-02", lectureCompletedOn: "2026-09-10" },
    ],
    deletedAt: null,
  } as unknown as StudyPlan;
}

function state(): PlannerState {
  return { version: 3, plans: [plan()], activePlanId: "p1", days: [], freezeWeeks: [], watchLogs: [] };
}

describe("ink -> tasks bridge", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
    setPlannerNow(new Date(`${TODAY}T09:00:00`));
    resetPlannerWorkspace();
    replaceState(state());
  });
  afterEach(() => {
    setPlannerNow(null);
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("scheduleReinks writes one revision task per draft, on the draft's day, with the Ink note; duplicates are skipped; undo removes them", () => {
    const p = readPlanner().plans[0]!;
    const items = inkItems(p);
    const drafts = planReinks(items, { from: TODAY, until: "2026-11-05", prefs: p.prefs, limit: 3 });
    assert.ok(drafts.length >= 2, "B, C, D have all faded by the deadline");
    assert.ok(!drafts.some((d) => d.lessonId === "A"), "the recently reviewed lesson is not picked");
    const added = scheduleReinks("p1", drafts);
    assert.equal(added, drafts.length);
    const after = liveTasks(readPlanner().plans[0]!.tasks).filter((t) => t.type === "revision");
    assert.equal(after.length, drafts.length);
    for (const d of drafts) {
      const t = after.find((x) => x.lessonId === d.lessonId)!;
      assert.ok(t, `task for ${d.lessonId}`);
      assert.equal(t.date, d.date);
      assert.equal(t.status, "pending");
      assert.equal(t.note, "from Ink");
      assert.match(t.title, /^Re-ink: /);
      assert.deepEqual(t.refLessonIds, [d.lessonId]);
    }
    // Scheduling the same drafts again adds nothing.
    assert.equal(scheduleReinks("p1", drafts), 0);
    assert.equal(liveTasks(readPlanner().plans[0]!.tasks).filter((t) => t.type === "revision").length, drafts.length);
    // Plan end date stretches to the last re-ink day.
    assert.ok(readPlanner().plans[0]!.endDate >= drafts[drafts.length - 1]!.date);
    // Undo.
    assert.equal(undoLast(), true);
    assert.equal(liveTasks(readPlanner().plans[0]!.tasks).filter((t) => t.type === "revision").length, 0);
  });

  it("rating a re-ink task from Today closes the loop: it marks done and advances the review stage", () => {
    const p = readPlanner().plans[0]!;
    const drafts = planReinks(inkItems(p), { from: TODAY, until: "2026-11-05", prefs: p.prefs, limit: 1 });
    scheduleReinks("p1", drafts);
    const task = liveTasks(readPlanner().plans[0]!.tasks).find((t) => t.type === "revision")!;
    rateRevision("p1", task.id, "ok");
    const again = readPlanner().plans[0]!;
    assert.equal(again.tasks.find((t) => t.id === task.id)!.status, "done");
    const review = again.reviews!.find((r) => r.lessonId === task.lessonId)!;
    assert.ok(review.dueDate! > TODAY, "next review is in the future");
  });

  it("calibration: a 'shaky' on a lesson the model called crisp lowers that lesson's multiplier and makes its ink fade faster", () => {
    const before = inkItems(readPlanner().plans[0]!).find((i) => i.lessonId === "A")!;
    assert.equal(before.calibration, 1);
    reinkLesson("p1", "A", "shaky");
    const reviews = readPlanner().plans[0]!.reviews!;
    const a = reviews.find((r) => r.lessonId === "A")!;
    assert.ok(a.calibration! < 1, `calibration dropped: ${a.calibration}`);
    const after = inkItems(readPlanner().plans[0]!).find((i) => i.lessonId === "A")!;
    assert.equal(after.calibration, a.calibration);
    // Stability for the same stage/rating is smaller with the lowered multiplier.
    assert.ok(after.stability < before.stability * 2, "stability did not explode");
    // A 'solid' on a ghost raises it; B is a ghost today.
    const bBefore = inkItems(readPlanner().plans[0]!).find((i) => i.lessonId === "B")!;
    reinkLesson("p1", "B", "solid");
    const b = readPlanner().plans[0]!.reviews!.find((r) => r.lessonId === "B")!;
    assert.ok(b.calibration! > 1, `ghost rated solid -> calibration up: ${b.calibration}`);
    assert.ok(bBefore.calibration === 1);
  });

  it("old states without a calibration field still load and compute as multiplier 1", () => {
    const items = inkItems(readPlanner().plans[0]!);
    assert.ok(items.every((i) => i.calibration === 1));
  });
});
