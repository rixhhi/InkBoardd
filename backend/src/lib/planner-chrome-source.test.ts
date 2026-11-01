import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function src(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("leftover chrome off the paint", () => {
  it("plan switcher is a lined inscription, not a rainbow dropdown", () => {
    const file = src("../../../frontend/src/components/planner/plan-switcher.tsx");
    assert.doesNotMatch(file, /PLAN_COLORS/);
    assert.doesNotMatch(file, /lucide-react/);
    assert.doesNotMatch(file, /DropdownMenu/);
  });

  it("day-board lines have no lucide soup, start lives in the ledger", () => {
    const row = src("../../../frontend/src/components/planner/task-row.tsx");
    const today = src("../../../frontend/src/components/planner/today-page.tsx");
    const ledger = src("../../../frontend/src/components/folio/ledger.tsx");
    assert.doesNotMatch(row, /lucide-react/);
    assert.doesNotMatch(row, /MoreHorizontal/);
    assert.doesNotMatch(today, /Start the board/);
    assert.doesNotMatch(today, /Shorten my day/);
    assert.match(ledger, /Start the board/);
    assert.doesNotMatch(today, /The board is on/);
    assert.doesNotMatch(ledger, /The board is on/);
  });

  it("live door retries a dropped picture", () => {
    const stage = src("../../../frontend/src/components/live-stage.tsx");
    const cam = src("../../../frontend/src/components/janus-cam.tsx");
    assert.match(stage, /COPY\.tryAgain/);
    assert.match(stage, /setJoin/);
    assert.match(cam, /reconnect/);
    assert.match(cam, /tries >= 3/);
  });
});
