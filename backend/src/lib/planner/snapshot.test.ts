import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getServerPlanner, recordWatchTick, readPlanner, resetPlannerRuntime, subscribePlanner, upsertPlan } from "@inkboard/shared/planner/storage";
import { setPlannerNow } from "@inkboard/shared/planner/dates";
import { fillPrefs, fillTask } from "@inkboard/shared/planner/types";

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

describe("planner snapshot stability", () => {
  it("getServerPlanner returns the same frozen object", () => {
    assert.equal(getServerPlanner(), getServerPlanner());
  });

  it("seeking and hidden ticks do not replace the planner snapshot", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 4, 12, 0, 0));
    upsertPlan({
      id: "plan1",
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
      tasks: [fillTask({ id: "t1", date: "2026-03-04", title: "Optics", lessonId: "LESSON1", durationMin: 40 })],
    });
    const snap = readPlanner();
    recordWatchTick("LESSON1", 0, 2400, false, 2400);
    recordWatchTick("LESSON1", 10, 12, true, 600);
    assert.equal(readPlanner(), snap);
  });

  it("playback ticks do not recurse through subscribePlanner", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 4, 12, 0, 0));
    upsertPlan({
      id: "plan1",
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
      tasks: [fillTask({ id: "t1", date: "2026-03-04", title: "Optics", lessonId: "LESSON1", durationMin: 40 })],
    });
    let emits = 0;
    const stop = subscribePlanner(() => {
      emits += 1;
      if (emits > 40) throw new Error("Maximum update depth exceeded");
      readPlanner();
    });
    let prev = 0;
    for (let t = 0.25; t <= 8; t += 0.25) {
      const r = recordWatchTick("LESSON1", prev, t, false, 600);
      prev = r.nextPrev;
    }
    stop();
    assert.ok(emits < 20, `too many planner emits: ${emits}`);
    assert.equal(readPlanner().plans[0]!.tasks[0]!.status, "pending");
  });

  it("100 playback ticks keep the same planner object identity", () => {
    mockStorage();
    setPlannerNow(new Date(2026, 2, 4, 12, 0, 0));
    upsertPlan({
      id: "plan1",
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
      tasks: [fillTask({ id: "t1", date: "2026-03-04", title: "Optics", lessonId: "LESSON1", durationMin: 40 })],
    });
    const first = readPlanner();
    let prev = 0;
    for (let i = 0; i < 100; i += 1) {
      const next = prev + 0.25;
      const r = recordWatchTick("LESSON1", prev, next, false, 2400);
      prev = r.nextPrev;
      assert.equal(readPlanner(), first);
    }
  });
});
