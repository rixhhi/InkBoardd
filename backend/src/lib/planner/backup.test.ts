import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { backupSummary, dryRunImport, exportPlannerJson, importPlannerBackup, parsePlannerBackup } from "@inkboard/shared/planner/backup";
import { fillPrefs, fillTask, type StudyPlan } from "@inkboard/shared/planner/types";
import { readPlanner, resetPlannerRuntime, upsertPlan } from "@inkboard/shared/planner/storage";

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

function sample(): StudyPlan {
  return {
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
  };
}

describe("planner backup", () => {
  it("round-trips JSON and rejects garbage", () => {
    mockStorage();
    upsertPlan(sample());
    const raw = exportPlannerJson();
    const parsed = parsePlannerBackup(raw);
    assert.equal(parsed.plans[0]!.id, "p1");
    assert.throws(() => parsePlannerBackup("{nope"));
    importPlannerBackup(raw, "replace");
    assert.equal(readPlanner().plans[0]!.id, "p1");
  });

  it("dry-runs an older backup without freezeWeeks", () => {
    mockStorage();
    const raw = JSON.stringify({
      version: 1,
      plans: [sample()],
      activePlanId: "p1",
    });
    const summary = dryRunImport(raw);
    assert.equal(summary.plans, 1);
    assert.equal(summary.tasks, 1);
    assert.equal(summary.name, "NEET");
    const parsed = parsePlannerBackup(raw);
    assert.deepEqual(parsed.freezeWeeks, []);
  });

  it("summarises live plans", () => {
    mockStorage();
    upsertPlan(sample());
    const s = backupSummary(readPlanner());
    assert.equal(s.plans, 1);
    assert.equal(s.tasks, 1);
  });
});
