import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  addVacation,
  archivePlan,
  completeLessonInPlan,
  deletePlan,
  duplicatePlan,
  importRemoteBundle,
  liveTasks,
  mergeFreezeWeeks,
  patchTask,
  plannerQuotaError,
  rateRevision,
  readPlanner,
  replacePlanTasks,
  resetPlannerRuntime,
  setTaskStatus,
  todaysTasks,
  upsertPlan,
  visiblePlans,
} from "@inkboard/shared/planner/storage";
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

function plan(over: Partial<StudyPlan> = {}): StudyPlan {
  return {
    id: "plan1",
    examId: "YOTUH",
    examName: "NEET UG",
    name: "NEET · AG",
    prefs: fillPrefs({ startDate: "2026-03-02" }),
    startDate: "2026-03-02",
    endDate: "2026-03-20",
    active: true,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    deletedAt: null,
    courses: [],
    tasks: [fillTask({ id: "t1", date: "2026-03-02", title: "Optics", lessonId: "LESSON1", durationMin: 40 })],
    ...over,
  };
}

describe("planner storage", () => {
  it("round-trips a plan and marks the newest as active", () => {
    mockStorage();
    upsertPlan(plan());
    upsertPlan(plan({ id: "plan2", name: "JEE" }));
    const s = readPlanner();
    assert.equal(s.plans.length, 2);
    assert.equal(s.activePlanId, "plan2");
    assert.equal(s.plans.find((p) => p.id === "plan1")!.active, false);
  });

  it("completing a task credits TODAY not the scheduled date", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 8, 12, 0, 0));
    upsertPlan(plan());
    setTaskStatus("plan1", "t1", "done", 35);
    const s = readPlanner();
    assert.equal(s.plans[0]!.tasks[0]!.status, "done");
    assert.equal(s.days.find((d) => d.date === "2026-03-08")?.tasksDone, 1);
    assert.equal(s.days.find((d) => d.date === "2026-03-08")?.minutesStudied, 35);
    assert.equal(s.days.find((d) => d.date === "2026-03-02")?.tasksDone ?? 0, 0);
  });

  it("readPlanner returns a stable snapshot until a write", () => {
    mockStorage();
    upsertPlan(plan());
    assert.equal(readPlanner(), readPlanner());
  });

  it("quota failure keeps the last saved plan and surfaces a banner", () => {
    mockStorage();
    upsertPlan(plan());
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        get length() {
          return 0;
        },
      },
      configurable: true,
    });
    upsertPlan(plan({ id: "plan-fail", name: "Nope" }));
    assert.equal(readPlanner().plans.some((p) => p.id === "plan-fail"), false);
    assert.equal(readPlanner().plans[0]!.id, "plan1");
    assert.match(plannerQuotaError() ?? "", /backup/i);
  });

  it("importRemoteBundle ignores a malformed payload instead of wiping plans", () => {
    mockStorage();
    upsertPlan(plan());
    importRemoteBundle({} as never);
    assert.equal(readPlanner().plans[0]!.id, "plan1");
  });

  it("completeLessonInPlan matches the active plan by lesson id", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 8, 12, 0, 0));
    upsertPlan(plan());
    const hit = completeLessonInPlan("LESSON1", "manual");
    assert.ok(hit);
    assert.equal(readPlanner().plans[0]!.tasks[0]!.status, "done");
  });

  it("deletePlan tombstones the row and reassigns active", () => {
    mockStorage();
    upsertPlan(plan());
    upsertPlan(plan({ id: "plan2" }));
    deletePlan("plan2");
    const s = readPlanner();
    assert.equal(s.plans.length, 2);
    assert.ok(s.plans.find((p) => p.id === "plan2")!.deletedAt);
    assert.equal(visiblePlans(s).length, 1);
    assert.equal(s.activePlanId, "plan1");
  });

  it("replacePlanTasks tombstones dropped pending tasks instead of deleting them", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 8, 12, 0, 0));
    upsertPlan(plan());
    replacePlanTasks("plan1", [fillTask({ id: "t-new", title: "Rebuilt", date: "2026-03-09" })]);
    const all = readPlanner().plans[0]!.tasks;
    const old = all.find((t) => t.id === "t1");
    assert.ok(old?.deletedAt);
    assert.equal(liveTasks(all).length, 1);
    assert.equal(liveTasks(all)[0]!.id, "t-new");
    const raw = localStorage.getItem(PLANNER_KEY) ?? "";
    assert.ok(raw.includes("t1"));
  });

  it("mergeFreezeWeeks records a week once", () => {
    mockStorage();
    mergeFreezeWeeks(["2026-W10"]);
    mergeFreezeWeeks(["2026-W10", "2026-W11"]);
    assert.deepEqual(readPlanner().freezeWeeks, ["2026-W10", "2026-W11"]);
  });

  it("readPlanner returns the same object when storage has not changed", () => {
    mockStorage();
    const a = readPlanner();
    const b = readPlanner();
    assert.equal(a, b);
    mergeFreezeWeeks(["2026-W12"]);
    const c = readPlanner();
    assert.notEqual(a, c);
    assert.equal(c, readPlanner());
  });

  it("today's task list is referentially stable until the plan changes", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 2, 12, 0, 0));
    upsertPlan(plan());
    const s = readPlanner();
    const first = todaysTasks(s, "2026-03-02");
    const second = todaysTasks(s, "2026-03-02");
    assert.equal(first, second);
    assert.equal(first.length, 1);
  });

  it("vacation marks a range as holidays", () => {
    mockStorage();
    upsertPlan(plan());
    addVacation("plan1", "2026-03-10", "2026-03-12");
    const holidays = readPlanner().plans[0]!.prefs.holidays;
    assert.deepEqual(holidays, ["2026-03-10", "2026-03-11", "2026-03-12"]);
  });

  it("duplicates a plan with new ids and archives hide it from the switcher", () => {
    mockStorage();
    upsertPlan(plan());
    duplicatePlan("plan1");
    const s = readPlanner();
    assert.equal(visiblePlans(s).length, 2);
    const copy = s.plans.find((p) => p.id !== "plan1")!;
    assert.ok(copy.name.includes("copy"));
    assert.notEqual(copy.tasks[0]!.id, "t1");
    archivePlan("plan1");
    assert.equal(visiblePlans().length, 1);
    assert.equal(visiblePlans()[0]!.id, copy.id);
  });

  it("patchTask edits duration and note; rateRevision records shaky/ok/solid", () => {
    mockStorage();
    upsertPlan(
      plan({
        tasks: [
          fillTask({
            id: "r1",
            title: "Revise: Optics",
            type: "revision",
            date: "2026-03-02",
            refLessonIds: ["LESSON1"],
          }),
        ],
      }),
    );
    patchTask("plan1", "r1", { durationMin: 25, note: "focus on mirrors" });
    assert.equal(readPlanner().plans[0]!.tasks[0]!.durationMin, 25);
    rateRevision("plan1", "r1", "shaky");
    const next = readPlanner().plans[0]!;
    assert.equal(next.tasks[0]!.status, "done");
    assert.equal(next.reviews?.[0]?.lastRating, "shaky");
  });
});
