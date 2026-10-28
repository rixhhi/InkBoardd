import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { buildDelta, clearDirty, clearDirtySent, diffDirtyFrom, hasDirty, markDirty, readDirty, resetDirty, snapshotDirty } from "@inkboard/shared/planner/dirty";
import { EMPTY_STATE, fillPrefs, fillTask, type PlannerState, type StudyPlan } from "@inkboard/shared/planner/types";

afterEach(() => resetDirty());

function plan(over: Partial<StudyPlan> = {}): StudyPlan {
  return {
    id: "p1",
    examId: "YOTUH",
    examName: "NEET",
    name: "A",
    prefs: fillPrefs({ startDate: "2026-03-02" }),
    startDate: "2026-03-02",
    endDate: "2026-03-20",
    active: true,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    deletedAt: null,
    courses: [],
    tasks: [fillTask({ id: "t1", title: "Optics", date: "2026-03-02", updatedAt: "2026-03-01T00:00:00.000Z" })],
    ...over,
  };
}

describe("dirty tracking", () => {
  it("accumulates unique ids and builds a delta with planId on tasks", () => {
    markDirty({ plans: ["p1"], tasks: ["t1"] });
    markDirty({ tasks: ["t1", "t2"] });
    const d = readDirty();
    assert.deepEqual(d.plans, ["p1"]);
    assert.deepEqual(d.tasks.sort(), ["t1", "t2"]);
    assert.equal(hasDirty(d), true);
    const state: PlannerState = { ...EMPTY_STATE, plans: [plan()] };
    const delta = buildDelta(state, d);
    assert.equal(delta.full, false);
    assert.equal(delta.tasks[0]!.planId, "p1");
    assert.equal(delta.tasks[0]!.id, "t1");
    assert.equal(delta.plans[0]!.tasks.length, 0);
  });

  it("full dirty sends every row", () => {
    markDirty({ full: true });
    const state: PlannerState = { ...EMPTY_STATE, plans: [plan()], activePlanId: "p1" };
    const delta = buildDelta(state);
    assert.equal(delta.full, true);
    assert.equal(delta.tasks.length, 1);
    assert.equal(delta.activePlanId, "p1");
  });

  it("diffDirtyFrom only marks changed rows", () => {
    const a: PlannerState = { ...EMPTY_STATE, plans: [plan()] };
    const b: PlannerState = {
      ...EMPTY_STATE,
      plans: [
        plan({
          updatedAt: "2026-03-02T00:00:00.000Z",
          tasks: [fillTask({ id: "t1", title: "Optics", status: "done", updatedAt: "2026-03-02T00:00:00.000Z" })],
        }),
      ],
    };
    const d = diffDirtyFrom(a, b);
    assert.ok(d.plans?.includes("p1"));
    assert.ok(d.tasks?.includes("t1"));
    clearDirty();
    assert.equal(hasDirty(), false);
  });

  it("clearDirtySent keeps edits made while a push was in flight", () => {
    const state: PlannerState = { ...EMPTY_STATE, plans: [plan()] };
    markDirty({ tasks: ["t1"] });
    const sent = snapshotDirty(state, readDirty());
    markDirty({ tasks: ["t2"] });
    clearDirtySent(sent);
    const left = readDirty();
    assert.deepEqual(left.tasks, ["t2"]);
    assert.equal(hasDirty(left), true);
  });
});
