import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const kit = readFileSync(new URL("./kit.tsx", import.meta.url), "utf8");

describe("planner kit a11y contracts", () => {
  it("ProgressBar is a labelled progressbar", () => {
    assert.match(kit, /role="progressbar"/);
    assert.match(kit, /aria-valuenow=\{pct\}/);
    assert.match(kit, /aria-valuemin=\{0\}/);
    assert.match(kit, /aria-valuemax=\{100\}/);
    assert.match(kit, /progressPercent/);
  });

  it("IconButton always has an accessible name", () => {
    assert.match(kit, /aria-label=\{label\}/);
    assert.match(kit, /title=\{label\}/);
    assert.match(kit, /size-11/);
  });

  it("SegmentedControl is a tablist", () => {
    assert.match(kit, /role="tablist"/);
    assert.match(kit, /aria-label=\{ariaLabel\}/);
    assert.match(kit, /role="tab"/);
    assert.match(kit, /aria-selected=/);
  });

  it("EmptyPanel has a title, body and illustration", () => {
    assert.match(kit, /export function EmptyPanel/);
    assert.match(kit, /aria-hidden="true"/);
    assert.match(kit, /text-base font-semibold/);
  });

  it("InlineAlert uses a live status role", () => {
    assert.match(kit, /role="status"/);
  });

  it("PlannerCard supports an accent bar without a bright outline class", () => {
    assert.match(kit, /planner-card/);
    assert.doesNotMatch(kit, /border-border bg-surface p-3/);
  });

  it("BarChart uses a real height so percent bars can paint", () => {
    assert.match(kit, /chartBars/);
    assert.match(kit, /viewBox="0 0 100 100"/);
    assert.match(kit, /No sessions yet/);
    assert.match(kit, /fill="currentColor"/);
    assert.match(kit, /data-chart-peak/);
    assert.match(kit, /chartTip/);
    assert.match(kit, /Dashed line/);
    assert.match(kit, /role="status"/);
  });

  it("KitSelect is a labelled native select", () => {
    assert.match(kit, /export function KitSelect/);
    assert.match(kit, /aria-label=\{ariaLabel\}/);
  });
});
