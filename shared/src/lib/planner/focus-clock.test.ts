import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { focusClock } from "./focus.ts";

describe("focus clock", () => {
  it("counts down a 25 minute block, then a 5 minute break", () => {
    assert.deepEqual(focusClock(0), { phase: "work", leftSec: 25 * 60 });
    assert.deepEqual(focusClock(25 * 60 - 1), { phase: "work", leftSec: 1 });
    assert.deepEqual(focusClock(25 * 60), { phase: "break", leftSec: 5 * 60 });
    assert.deepEqual(focusClock(30 * 60), { phase: "done", leftSec: 0 });
    assert.equal(focusClock(Number.NaN).phase, "work");
    assert.equal(focusClock(-5).leftSec, 25 * 60);
  });
});
