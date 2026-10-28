import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function src(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("Phase 5 gates", () => {
  it("locks lighthouse scores and the layout-shift cap", () => {
    const budget = JSON.parse(src("../../lighthouserc.json")) as {
      ci: { assert: { assertions: Record<string, [string, { minScore?: number; maxNumericValue?: number }]> } };
    };
    assert.equal(budget.ci.assert.assertions["categories:performance"]?.[1]?.minScore, 0.9);
    assert.equal(budget.ci.assert.assertions["categories:accessibility"]?.[1]?.minScore, 0.95);
    assert.equal(budget.ci.assert.assertions["cumulative-layout-shift"]?.[1]?.maxNumericValue, 0.1);
  });

  it("caps the built JavaScript", () => {
    const script = src("../../scripts/bundle-budget.mjs");
    assert.match(script, /1_600_000/);
    assert.match(script, /4_500_000/);
  });

  it("smokes home, today, the player, and offline by HTTP status", () => {
    const script = src("../../scripts/phase5-smoke.mjs");
    for (const route of ["/", "/planner/today", "/play/YOTUH123", "/offline"]) {
      assert.match(script, new RegExp(route.replaceAll("/", "\\/")));
    }
    assert.match(script, /fetch\(url/);
    assert.doesNotMatch(script, /viewport/i);
    assert.doesNotMatch(script, /innerWidth/);
  });
});
