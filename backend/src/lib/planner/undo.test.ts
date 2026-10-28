import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { applyUndoEntry, clearUndo, popUndo, pushUndo, undoStackSize } from "@inkboard/shared/planner/undo";
import { EMPTY_STATE, fillPrefs, fillTask, type PlannerState, type StudyPlan } from "@inkboard/shared/planner/types";

afterEach(() => clearUndo());

function plan(): StudyPlan {
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
    tasks: [fillTask({ id: "t1", title: "A", date: "2026-03-02", status: "done" })],
  };
}

describe("undo stack", () => {
  it("keeps the last 10 entries and restores only affected tasks", () => {
    for (let i = 0; i < 12; i += 1) pushUndo({ label: `n${i}`, tasks: [fillTask({ id: "t1", title: `n${i}` })] });
    assert.equal(undoStackSize(), 10);
    const first = popUndo();
    assert.equal(first?.label, "n11");
    const state: PlannerState = { ...EMPTY_STATE, plans: [plan()] };
    const restored = applyUndoEntry(state, {
      label: "undo done",
      tasks: [fillTask({ id: "t1", title: "A", date: "2026-03-02", status: "pending" })],
    });
    assert.equal(restored.plans[0]!.tasks[0]!.status, "pending");
    const later = applyUndoEntry(restored, {
      label: "unrelated",
      tasks: [fillTask({ id: "t9", title: "other", date: "2026-03-03" })],
    });
    assert.equal(later.plans[0]!.tasks.find((t) => t.id === "t1")!.status, "pending");
  });
});
