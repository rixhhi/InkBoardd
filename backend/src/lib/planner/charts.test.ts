import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chartBars, chartLine, chartScale, minutesOnDate, sessionMinutesByDate } from "@inkboard/shared/planner/charts";
import { weekBars } from "@inkboard/shared/planner/daily";

describe("chartScale", () => {
  it("marks an all-zero series empty", () => {
    const s = chartScale([0, 0, 0], 90);
    assert.equal(s.empty, true);
    assert.deepEqual(s.percents, [0, 0, 0]);
    assert.equal(s.max, 90);
  });

  it("gives a single 40-minute day a visible bar against a 90-minute goal", () => {
    const days = Array.from({ length: 30 }, () => 0);
    days[29] = 40;
    const s = chartScale(days, 90);
    assert.equal(s.empty, false);
    assert.ok(s.percents[29]! > 40);
    assert.equal(s.percents.filter((p) => p === 0).length, 29);
  });

  it("fills the chart when every day is the same non-zero value", () => {
    const s = chartScale([40, 40, 40]);
    assert.equal(s.empty, false);
    assert.deepEqual(s.percents, [100, 100, 100]);
  });

  it("scales a normal week against the goal line", () => {
    const s = chartScale([20, 40, 90, 0, 60, 30, 10], 90);
    assert.equal(s.max, 90);
    assert.equal(s.percents[2], 100);
    assert.equal(s.goalPercent, 100);
    assert.ok(s.percents[1]! > 40 && s.percents[1]! < 50);
  });
});

describe("chartBars SVG layout", () => {
  it("keeps a >0-minute day at least 8 plot units tall (not ~0)", () => {
    const days = Array.from({ length: 30 }, () => 0);
    days[29] = 40;
    const layout = chartBars(days, 90);
    assert.equal(layout.empty, false);
    const bar = layout.bars[29]!;
    assert.ok(bar.h >= 8, `expected visible height, got ${bar.h}`);
    assert.ok(bar.y + bar.h === 100);
    assert.equal(layout.bars.filter((b) => b.h === 0).length, 29);
  });

  it("gives a lone data point a full-height bar when there is no larger goal", () => {
    const layout = chartBars([40]);
    assert.equal(layout.bars.length, 1);
    assert.equal(layout.bars[0]!.h, 100);
    assert.ok(layout.bars[0]!.w > 0);
  });

  it("treats equal non-zero days as full bars", () => {
    const layout = chartBars([40, 40, 40]);
    assert.ok(layout.bars.every((b) => b.h === 100));
  });
});

describe("chartLine", () => {
  it("draws a path across the plot without filling an area", () => {
    const line = chartLine([0, 40, 90], 90, ["a", "b", "c"]);
    assert.equal(line.empty, false);
    assert.equal(line.points.length, 3);
    assert.equal(line.points[0]!.y, 100);
    assert.equal(line.points[2]!.y, 0);
    assert.match(line.d, /^M /);
    assert.match(line.d, / L /);
    assert.equal(line.goalY, 0);
  });
});

describe("minutesOnDate", () => {
  it("uses the larger of the day log and session minutes", () => {
    assert.equal(minutesOnDate([{ date: "2026-03-04", minutesStudied: 0 }], "2026-03-04", 40), 40);
    assert.equal(minutesOnDate([{ date: "2026-03-04", minutesStudied: 40 }], "2026-03-04", 10), 40);
    assert.equal(minutesOnDate([], "2026-03-04", 0), 0);
  });

  it("sums live sessions so a logged 40-minute day charts without a study-day row", () => {
    const map = sessionMinutesByDate([
      { date: "2026-03-04", durationMin: 25, deletedAt: null },
      { date: "2026-03-04", durationMin: 15, deletedAt: null },
      { date: "2026-03-04", durationMin: 99, deletedAt: "2026-03-04T00:00:00.000Z" },
    ]);
    assert.equal(map["2026-03-04"], 40);
    const week = weekBars([], "2026-03-02", 90, map);
    assert.ok(week.some((d) => d.minutes === 40));
  });
});
