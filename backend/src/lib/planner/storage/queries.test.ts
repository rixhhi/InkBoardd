import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillPrefs, fillTask, type PlannerState } from "@inkboard/shared/planner/types";
import { activePlanOf, overdueOn, tasksOnDate, visiblePlansOf } from "@inkboard/shared/planner/storage/queries";

function state(): PlannerState {
  return {
    version: 3,
    activePlanId: "p1",
    freezeWeeks: [],
    days: [],
    watchLogs: [],
    plans: [
      {
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
          fillTask({ id: "t1", date: "2026-03-04", title: "Today", orderIdx: 1 }),
          fillTask({ id: "t0", date: "2026-03-02", title: "Overdue", orderIdx: 0 }),
          fillTask({ id: "t2", date: "2026-03-04", title: "Gone", deletedAt: "2026-03-04T00:00:00.000Z" }),
        ],
      },
      {
        id: "p2",
        examId: "YOTUH",
        examName: "NEET",
        name: "Old",
        prefs: fillPrefs({ startDate: "2026-03-02" }),
        startDate: "2026-03-02",
        endDate: "2026-03-20",
        active: false,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        deletedAt: "2026-03-03T00:00:00.000Z",
        courses: [],
        tasks: [],
      },
    ],
  };
}

describe("planner storage queries", () => {
  it("hides deleted plans and tasks, and picks the active plan", () => {
    const s = state();
    assert.equal(visiblePlansOf(s).length, 1);
    assert.equal(activePlanOf(s)?.id, "p1");
    assert.deepEqual(
      tasksOnDate(activePlanOf(s), "2026-03-04").map((t) => t.id),
      ["t1"],
    );
    assert.deepEqual(
      overdueOn(activePlanOf(s), "2026-03-04").map((t) => t.id),
      ["t0"],
    );
  });
});
