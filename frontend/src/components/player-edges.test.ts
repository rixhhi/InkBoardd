import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { abLoop, addSilenceSaved, holdRate, loopRestart, mediaDuration, resumeTime, retryDelayMs, sleepLeftMs } from "./player-controls.ts";

describe("player edges", () => {
  it("treats a live or broken duration as the packed timeline", () => {
    assert.equal(mediaDuration(Number.POSITIVE_INFINITY, 90), 90);
    assert.equal(mediaDuration(Number.NaN, 0), 0);
    assert.equal(mediaDuration(0, 12), 12);
  });

  it("does not resume past the end of a shorter file", () => {
    assert.equal(resumeTime(4000, 90), 0);
    assert.equal(resumeTime(40, 90), 40);
    assert.equal(resumeTime(40, Number.NaN), 40);
    assert.equal(resumeTime(-1, 90), 0);
  });

  it("rejects a loop shorter than one second and restarts at the mark", () => {
    assert.equal(abLoop(10, 10.2, 90), null);
    assert.deepEqual(abLoop(80, 10, 90), { start: 10, end: 80 });
    assert.equal(loopRestart(80, { start: 10, end: 80 }), 10);
    assert.equal(loopRestart(20, { start: 10, end: 80 }), null);
  });

  it("ends a sleep timer and backs off a failed segment", () => {
    assert.equal(sleepLeftMs(1_000, 61_000, 1), 0);
    assert.equal(sleepLeftMs(1_000, 1_000, 1), 60_000);
    assert.equal(sleepLeftMs(1_000, 1_000, 0), 0);
    assert.equal(retryDelayMs(0), 250);
    assert.equal(retryDelayMs(2), 1000);
    assert.equal(retryDelayMs(20), 8000);
  });

  it("holds at double speed and counts silence that was skipped", () => {
    assert.equal(holdRate(true, 1.25), 2);
    assert.equal(holdRate(false, 1.25), 1.25);
    assert.equal(holdRate(false, Number.NaN), 1);
    assert.equal(addSilenceSaved(4, 10, 18), 12);
    assert.equal(addSilenceSaved(4, 18, 10), 4);
  });
});
