import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityHeatmap, heatmapLevel, heatLabel } from "@inkboard/shared/planner/daily";
import { fillPrefs } from "@inkboard/shared/planner/types";

describe("heatmap levels and labels", () => {
  it("uses five goal-relative levels", () => {
    assert.equal(heatmapLevel(0), 0);
    assert.equal(heatmapLevel(0.24), 1);
    assert.equal(heatmapLevel(0.49), 2);
    assert.equal(heatmapLevel(0.74), 3);
    assert.equal(heatmapLevel(1), 4);
  });

  it("labels a cell with date, value and percent of goal", () => {
    const { cells } = activityHeatmap({
      today: "2026-03-04",
      weeks: 1,
      days: [{ date: "2026-03-04", minutesStudied: 45, tasksDone: 2, updatedAt: "" }],
      plan: {
        id: "p",
        examId: "x",
        examName: "x",
        name: "x",
        prefs: fillPrefs({ dailyMinutes: 90, lecturesPerDay: 3 }),
        startDate: "2026-03-02",
        endDate: "2026-03-20",
        active: true,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
        courses: [],
        tasks: [],
      },
    });
    const cell = cells.flat().find((c) => c.date === "2026-03-04")!;
    assert.ok(cell);
    assert.equal(cell.minutes, 45);
    assert.equal(heatmapLevel(cell.percent), cell.level);
    assert.match(heatLabel(cell, 90, "minutes"), /45 min/);
    assert.match(heatLabel(cell, 90, "minutes"), /% of goal/);
  });
});
