import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canPushRemote, mergePlannerStates, mergeTasks } from "@inkboard/shared/planner/merge";
import { EMPTY_STATE, fillPrefs, fillTask, type PlannerState, type StudyPlan } from "@inkboard/shared/planner/types";

function plan(over: Partial<StudyPlan> & Pick<StudyPlan, "id">): StudyPlan {
  return {
    examId: "YOTUH",
    examName: "NEET",
    name: over.id,
    prefs: fillPrefs({ startDate: "2026-03-02" }),
    startDate: "2026-03-02",
    endDate: "2026-03-20",
    active: true,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    deletedAt: null,
    courses: [],
    tasks: [fillTask({ id: `${over.id}-t`, title: "A", date: "2026-03-02" })],
    ...over,
  };
}

function state(over: Partial<PlannerState> = {}): PlannerState {
  return { ...EMPTY_STATE, ...over };
}

describe("mergePlannerStates", () => {
  it("merges plans by id and prefers the newer updatedAt", () => {
    const local = state({
      plans: [plan({ id: "p1", name: "local", updatedAt: "2026-03-02T10:00:00.000Z" })],
      activePlanId: "p1",
    });
    const remote = state({
      plans: [plan({ id: "p1", name: "remote", updatedAt: "2026-03-02T12:00:00.000Z" })],
      activePlanId: "p1",
    });
    const m = mergePlannerStates(local, remote);
    assert.equal(m.plans[0]!.name, "remote");
  });

  it("keeps a tombstone so a deleted plan does not resurrect", () => {
    const local = state({
      plans: [plan({ id: "p1", deletedAt: "2026-03-03T00:00:00.000Z", updatedAt: "2026-03-03T00:00:00.000Z", active: false })],
    });
    const remote = state({
      plans: [plan({ id: "p1", name: "still here", updatedAt: "2026-03-02T00:00:00.000Z" })],
      activePlanId: "p1",
    });
    const m = mergePlannerStates(local, remote);
    assert.ok(m.plans[0]!.deletedAt);
    assert.equal(m.activePlanId, null);
  });

  it("unions freeze weeks and maxes study-day minutes", () => {
    const local = state({
      freezeWeeks: ["2026-W10"],
      days: [{ date: "2026-03-02", minutesStudied: 10, tasksDone: 1, updatedAt: "2026-03-02T10:00:00.000Z" }],
    });
    const remote = state({
      freezeWeeks: ["2026-W11"],
      days: [{ date: "2026-03-02", minutesStudied: 40, tasksDone: 0, updatedAt: "2026-03-02T12:00:00.000Z" }],
    });
    const m = mergePlannerStates(local, remote);
    assert.deepEqual(m.freezeWeeks, ["2026-W10", "2026-W11"]);
    assert.equal(m.days[0]!.minutesStudied, 40);
    assert.equal(m.days[0]!.tasksDone, 1);
  });

  it("merges tasks independently so a completion is not lost", () => {
    const local = state({
      plans: [
        plan({
          id: "p1",
          updatedAt: "2026-03-02T10:00:00.000Z",
          tasks: [fillTask({ id: "t1", title: "A", status: "done", updatedAt: "2026-03-02T11:00:00.000Z" })],
        }),
      ],
    });
    const remote = state({
      plans: [
        plan({
          id: "p1",
          name: "newer plan meta",
          updatedAt: "2026-03-02T12:00:00.000Z",
          tasks: [fillTask({ id: "t1", title: "A", status: "pending", updatedAt: "2026-03-02T09:00:00.000Z" })],
        }),
      ],
    });
    const m = mergePlannerStates(local, remote);
    assert.equal(m.plans[0]!.name, "newer plan meta");
    assert.equal(m.plans[0]!.tasks[0]!.status, "done");
  });

  it("keeps the newer task tombstone so rebuilds do not duplicate", () => {
    const merged = mergeTasks(
      [fillTask({ id: "t1", title: "A", deletedAt: "2026-03-05T00:00:00.000Z", updatedAt: "2026-03-05T00:00:00.000Z" })],
      [fillTask({ id: "t1", title: "A", status: "pending", updatedAt: "2026-03-02T00:00:00.000Z" })],
    );
    assert.ok(merged[0]!.deletedAt);
  });

  it("refuses a remote push until load has succeeded", () => {
    assert.equal(canPushRemote("local-only"), false);
    assert.equal(canPushRemote("syncing"), false);
    assert.equal(canPushRemote("error"), false);
    assert.equal(canPushRemote("offline"), false);
    assert.equal(canPushRemote("synced"), true);
  });
});
