import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plannerShortcutsActive } from "@inkboard/shared/planner/shortcuts-active";

describe("plannerShortcutsActive", () => {
  it("is true only on planner routes", () => {
    assert.equal(plannerShortcutsActive("/planner"), true);
    assert.equal(plannerShortcutsActive("/planner/today"), true);
    assert.equal(plannerShortcutsActive("/planner/dashboard"), true);
    assert.equal(plannerShortcutsActive("/play/x"), false);
    assert.equal(plannerShortcutsActive("/play/2O24MEDDGPTI2AZ00YMV"), false);
    assert.equal(plannerShortcutsActive("/live/x"), false);
    assert.equal(plannerShortcutsActive("/"), false);
    assert.equal(plannerShortcutsActive("/exam/NVLIA"), false);
  });
});
