import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { overlayInPlan, plannedCourseIds } from "@inkboard/shared/catalog-plan";
import { localGet, localSet } from "@inkboard/shared/local-cache";
import { activePlan, resetPlannerRuntime, upsertPlan } from "@inkboard/shared/planner/storage";
import { fillPrefs, fillTask, type StudyPlan } from "@inkboard/shared/planner/types";

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
});

function plan(over: Partial<StudyPlan> = {}): StudyPlan {
  return {
    id: "plan1",
    examId: "NVLIA",
    examName: "GATE CS",
    name: "GATE CS · TOC",
    prefs: fillPrefs({ startDate: "2026-03-02" }),
    startDate: "2026-03-02",
    endDate: "2026-03-20",
    active: true,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    deletedAt: null,
    courses: [{ courseId: "COURSE1", title: "TOC", teacher: "Ankit", lessons: [] }],
    tasks: [fillTask({ id: "t1", date: "2026-03-02", title: "Language to DFA", courseId: "COURSE1" })],
    ...over,
  };
}

describe("catalog vs planner cache", () => {
  it("marks a course in-plan from live planner state, not the cached hub", () => {
    mockStorage();
    localSet("exam-hub-v6:NVLIA", {
      courses: [
        { uid: "COURSE1", name: "TOC" },
        { uid: "COURSE2", name: "OS" },
      ],
    });
    assert.equal(activePlan(), null);

    upsertPlan(plan());

    const cached = localGet<{ courses: { uid: string; name: string }[] }>("exam-hub-v6:NVLIA");
    assert.equal(cached?.data.courses.length, 2);
    assert.equal("inPlan" in (cached?.data.courses[0] ?? {}), false);

    const overlaid = overlayInPlan(cached!.data.courses, plannedCourseIds(activePlan()));
    assert.equal(overlaid[0]?.inPlan, true);
    assert.equal(overlaid[1]?.inPlan, false);
    assert.equal(activePlan()?.name, "GATE CS · TOC");
  });

  it("adding a second course updates overlay without rewriting the hub cache", () => {
    mockStorage();
    localSet("exam-hub-v6:NVLIA", { courses: [{ uid: "COURSE1" }, { uid: "COURSE2" }] });
    upsertPlan(plan());
    upsertPlan(
      plan({
        courses: [
          { courseId: "COURSE1", title: "TOC", teacher: "Ankit", lessons: [] },
          { courseId: "COURSE2", title: "OS", teacher: "Ankit", lessons: [] },
        ],
      }),
    );
    const cached = localGet<{ courses: { uid: string }[] }>("exam-hub-v6:NVLIA")!;
    const overlaid = overlayInPlan(cached.data.courses, plannedCourseIds(activePlan()));
    assert.deepEqual(
      overlaid.map((c) => c.inPlan),
      [true, true],
    );
    assert.equal("inPlan" in cached.data.courses[0]!, false);
  });
});
