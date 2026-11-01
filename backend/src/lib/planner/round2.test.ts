import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { chartBars, minutesOnDate, sessionMinutesByDate } from "@inkboard/shared/planner/charts";
import { showCatchUp } from "@inkboard/shared/planner/daily";

describe("round 2 phase 1 regressions", () => {
  it("a 40-minute day in a 30-day 90-min-goal series produces a visible SVG bar", () => {
    const days = Array.from({ length: 30 }, () => 0);
    days[29] = 40;
    const layout = chartBars(days, 90);
    const bar = layout.bars[29]!;
    assert.equal(layout.empty, false);
    assert.ok(bar.h >= 8);
    assert.equal(Math.round(bar.h), 44);
  });

  it("Dashboard charts pull session minutes so a lone log is not an empty series", () => {
    const src = readFileSync(new URL("../../../../frontend/src/components/planner/dashboard-page.tsx", import.meta.url), "utf8");
    assert.match(src, /sessionMinutesByDate/);
    assert.match(src, /minutesOnDate\(state\.days, d, sessionMins/);
    const map = sessionMinutesByDate([{ date: "2026-03-04", durationMin: 40, deletedAt: null }]);
    const values = Array.from({ length: 30 }, (_, i) =>
      minutesOnDate([], i === 29 ? "2026-03-04" : `2026-02-${String(i + 1).padStart(2, "0")}`, map["2026-03-04"] && i === 29 ? 40 : 0),
    );
    const layout = chartBars(values, 90);
    assert.equal(layout.empty, false);
    assert.ok(layout.bars[29]!.h >= 8);
  });

  it("catch-up UI can be forced open even when overdue-behind is false (pace-behind pill)", () => {
    assert.equal(showCatchUp(false, false), false);
    assert.equal(showCatchUp(false, true), true);
    assert.equal(showCatchUp(true, false), true);
  });

  it("Analytics keeps one Revision health KPI that jumps to the full section", () => {
    const src = readFileSync(new URL("../../../../frontend/src/pages/planner-analytics-page.tsx", import.meta.url), "utf8");
    const kpi = src.match(/href="#revision-health"/g) ?? [];
    assert.equal(kpi.length, 1);
    assert.match(src, /<RevisionHealthPanel/);
    assert.equal((src.match(/Revision health/g) ?? []).length, 1);
    assert.ok(src.indexOf('href="#revision-health"') < src.indexOf("<RevisionHealthPanel"));
  });

  it("Dashboard and Calendar pace-behind pills open the catch-up banner", () => {
    const dash = readFileSync(new URL("../../../../frontend/src/components/planner/dashboard-page.tsx", import.meta.url), "utf8");
    const cal = readFileSync(new URL("../../../../frontend/src/components/planner/calendar-page.tsx", import.meta.url), "utf8");
    assert.match(dash, /PaceCatchUpButton/);
    assert.match(cal, /PaceCatchUpButton/);
    assert.match(dash, /force=\{catchUp \|\| pace\.status === "behind"\}/);
    assert.match(cal, /force=\{catchUp \|\| pace\.status === "behind"\}/);
  });

  it("never parks a vertical filmstrip in leftover stage width", () => {
    const src = readFileSync(new URL("../../../../frontend/src/components/class-player.tsx", import.meta.url), "utf8");
    assert.match(src, /sideStrip/);
    assert.match(src, /layoutSlate/);
    assert.doesNotMatch(src, /film-rebate-dock/);
    const controls = readFileSync(new URL("../../../../frontend/src/components/player-controls.ts", import.meta.url), "utf8");
    assert.match(controls, /sideStrip: Boolean\(opts\.filmOn\)/);
    assert.doesNotMatch(controls, /leftover >= 112/);
  });

  it("BarChart fill uses currentColor so bars are not black-on-black", () => {
    const kit = readFileSync(new URL("../../../../frontend/src/components/ui/planner/kit.tsx", import.meta.url), "utf8");
    assert.match(kit, /fill="currentColor"/);
    assert.match(kit, /className="text-accent"/);
    assert.doesNotMatch(kit, /fill="var\(--color-primary\)"/);
  });
});
