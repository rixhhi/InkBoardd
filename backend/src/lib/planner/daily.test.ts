import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activityHeatmap,
  coachNext,
  formatClock,
  heatmapLevel,
  isBehind,
  oldestOverdueIds,
  orderQueue,
  queueClockTimes,
  showCatchUp,
} from "@inkboard/shared/planner/daily";
import { fillTask } from "@inkboard/shared/planner/types";
import { fillPrefs } from "@inkboard/shared/planner/types";

describe("today queue", () => {
  it("orders revision, then lectures, then DPP", () => {
    const q = orderQueue([
      fillTask({ id: "l", title: "L", type: "lesson", orderIdx: 0 }),
      fillTask({ id: "d", title: "D", type: "dpp", orderIdx: 0 }),
      fillTask({ id: "r", title: "R", type: "revision", orderIdx: 0 }),
    ]);
    assert.deepEqual(
      q.map((t) => t.id),
      ["r", "l", "d"],
    );
  });

  it("is behind after two overdue study days", () => {
    const prefs = fillPrefs({ studyDays: [1, 2, 3, 4, 5] });
    const tasks = [
      fillTask({ id: "a", title: "A", date: "2026-03-02", status: "pending" }),
      fillTask({ id: "b", title: "B", date: "2026-03-03", status: "pending" }),
    ];
    assert.equal(isBehind(tasks, "2026-03-05", prefs), true);
    assert.deepEqual(oldestOverdueIds(tasks, "2026-03-05"), ["a"]);
    assert.equal(showCatchUp(false, true), true);
    assert.equal(showCatchUp(false, false), false);
  });

  it("coach prefers overdue revision over today's lecture", () => {
    const today = [fillTask({ id: "lec", title: "L", type: "lesson", status: "pending" })];
    const overdue = [fillTask({ id: "rev", title: "R", type: "revision", status: "pending", date: "2026-03-01" })];
    const next = coachNext(today, overdue);
    assert.equal(next.kind, "revision");
    assert.equal(next.task?.id, "rev");
  });

  it("stamps evening sessions from ~7pm", () => {
    assert.equal(formatClock(19 * 60), "7pm");
    assert.equal(formatClock(19 * 60 + 25), "7:25pm");
    const clocks = queueClockTimes(
      [
        fillTask({ id: "r", title: "R", type: "revision", durationMin: 20, orderIdx: 0 }),
        fillTask({ id: "l", title: "L", type: "lesson", durationMin: 40, orderIdx: 0 }),
      ],
      "evening",
    );
    assert.equal(clocks.get("r"), "7pm");
    assert.equal(clocks.get("l"), "7:20pm");
    assert.equal(formatClock(19 * 60, false), "19:00");
    assert.equal(formatClock(19 * 60 + 25, false), "19:25");
  });
});

describe("heatmap", () => {
  it("maps progress to 5 levels", () => {
    assert.equal(heatmapLevel(0), 0);
    assert.equal(heatmapLevel(0.1), 1);
    assert.equal(heatmapLevel(0.4), 2);
    assert.equal(heatmapLevel(0.7), 3);
    assert.equal(heatmapLevel(1), 4);
  });

  it("builds 7 x N week grid ending this week", () => {
    const { cells } = activityHeatmap({
      today: "2026-03-04",
      weeks: 4,
      days: [{ date: "2026-03-04", minutesStudied: 90, tasksDone: 3, updatedAt: "" }],
      plan: null,
    });
    assert.equal(cells.length, 4);
    assert.equal(cells[0]!.length, 7);
    assert.ok(cells.flat().some((c) => c.date === "2026-03-04" && c.level === 4));
  });
});
