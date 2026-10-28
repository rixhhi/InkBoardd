import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { heatmapMove, progressPercent } from "@inkboard/shared/planner/daily";

describe("heatmap keyboard", () => {
  const dates = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-09", "2026-03-10"];

  it("moves by day and week, Home/End, Escape", () => {
    assert.equal(heatmapMove("2026-03-03", "ArrowUp", dates), "2026-03-02");
    assert.equal(heatmapMove("2026-03-03", "ArrowDown", dates), "2026-03-04");
    assert.equal(heatmapMove("2026-03-03", "ArrowRight", dates), "2026-03-10");
    assert.equal(heatmapMove("2026-03-09", "ArrowLeft", dates), "2026-03-02");
    assert.equal(heatmapMove("2026-03-03", "Home", dates), "2026-03-02");
    assert.equal(heatmapMove("2026-03-03", "End", dates), "2026-03-10");
    assert.equal(heatmapMove("2026-03-03", "Escape", dates), null);
  });

  it("ignores moves that would leave the grid", () => {
    assert.equal(heatmapMove("2026-03-02", "ArrowUp", dates), "2026-03-02");
    assert.equal(heatmapMove("2026-03-02", "ArrowLeft", dates), "2026-03-02");
  });

  it("clamps progress bars", () => {
    assert.equal(progressPercent(0, 100), 0);
    assert.equal(progressPercent(50, 100), 50);
    assert.equal(progressPercent(150, 100), 100);
    assert.equal(progressPercent(10, 0), 0);
  });
});
