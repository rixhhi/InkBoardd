import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRecoveryPoint, guardDestructive, listRecoveryPoints, restoreRecoveryPoint, MAX_RECOVERY } from "@inkboard/shared/planner/recovery";
import { fillPrefs, fillTask, type StudyPlan } from "@inkboard/shared/planner/types";
import { readPlanner, resetPlannerRuntime, upsertPlan } from "@inkboard/shared/planner/storage";

function mockStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (k.includes("fail")) throw new Error("quota");
        store.set(k, String(v));
      },
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

function plan(id: string, name: string): StudyPlan {
  return {
    id,
    examId: "YOTUH",
    examName: "NEET",
    name,
    prefs: fillPrefs({ startDate: "2026-03-02" }),
    startDate: "2026-03-02",
    endDate: "2026-03-20",
    active: true,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    deletedAt: null,
    courses: [],
    tasks: [fillTask({ id: `${id}-t`, title: "A", date: "2026-03-02" })],
  };
}

describe("recovery points", () => {
  it("keeps the latest 3 and restore puts the snapshot back", () => {
    mockStorage();
    upsertPlan(plan("p1", "one"));
    assert.equal(createRecoveryPoint("rebuild"), true);
    upsertPlan(plan("p2", "two"));
    createRecoveryPoint("import");
    upsertPlan(plan("p3", "three"));
    createRecoveryPoint("delete");
    upsertPlan(plan("p4", "four"));
    createRecoveryPoint("reset");
    const list = listRecoveryPoints();
    assert.equal(list.length, MAX_RECOVERY);
    const oldestKept = list[list.length - 1]!;
    restoreRecoveryPoint(oldestKept.id);
    assert.ok(readPlanner().plans.some((p) => p.name === oldestKept.state.plans[0]?.name));
  });

  it("returns false when the checkpoint cannot be written", () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => undefined,
        clear: () => store.clear(),
        key: () => null,
        length: 0,
      },
      configurable: true,
    });
    assert.equal(createRecoveryPoint("rebuild"), false);
  });

  it("guardDestructive throws when a checkpoint cannot be written", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
      configurable: true,
    });
    assert.throws(() => guardDestructive("rebuild"), /recovery point/);
  });
});
