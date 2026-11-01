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
    const a = budget.ci.assert.assertions;
    assert.equal(a["categories:performance"]?.[1]?.minScore, 0.9);
    assert.equal(a["categories:accessibility"]?.[1]?.minScore, 1);
    assert.equal(a["categories:best-practices"]?.[1]?.minScore, 0.95);
    assert.equal(a["categories:seo"]?.[1]?.minScore, 0.9);
    assert.equal(a["cumulative-layout-shift"]?.[1]?.maxNumericValue, 0.05);
    // Everything except performance is fatal.
    for (const k of ["categories:accessibility", "categories:best-practices", "categories:seo", "cumulative-layout-shift"]) {
      assert.equal(a[k]?.[0], "error", `${k} must be a hard gate`);
    }
  });

  it("caps the built JavaScript", () => {
    const script = src("../../scripts/bundle-budget.mjs");
    assert.match(script, /900_000/);
    assert.match(script, /3_000_000/);
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
