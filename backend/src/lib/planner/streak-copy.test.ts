import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freezeCopy, nextStreakMilestone, streakStateLabel } from "@inkboard/shared/planner/streak-copy";

describe("streak copy", () => {
  it("points at the next unearned milestone in tally language", () => {
    assert.equal(nextStreakMilestone(0).at, 1);
    assert.equal(nextStreakMilestone(0).label, "1-day streak");
    assert.equal(nextStreakMilestone(7).at, 14);
    assert.equal(nextStreakMilestone(7).label, "14-day streak");
    assert.equal(nextStreakMilestone(100).at, 100);
  });

  it("labels at-risk and freeze states as marks, not flames", () => {
    assert.equal(
      streakStateLabel({ current: 4, atRisk: true, savedByFreeze: false, freezeLeft: 1, comebacks: 0 }),
      "Mark at risk — write today",
    );
    assert.equal(
      streakStateLabel({ current: 4, atRisk: false, savedByFreeze: true, freezeLeft: 0, comebacks: 0 }),
      "A freeze kept the mark",
    );
    assert.equal(
      streakStateLabel({ current: 1, atRisk: false, savedByFreeze: false, freezeLeft: 1, comebacks: 1 }),
      "Comeback · 1-day streak",
    );
    assert.equal(
      streakStateLabel({ current: 5, atRisk: false, savedByFreeze: false, freezeLeft: 1, comebacks: 0 }),
      "5-day streak.",
    );
    assert.equal(
      streakStateLabel({ current: 0, atRisk: false, savedByFreeze: false, freezeLeft: 1, comebacks: 0 }),
      "No streak.",
    );
    assert.equal(
      streakStateLabel({ current: 0, atRisk: false, savedByFreeze: false, freezeLeft: 1, comebacks: 0, longest: 7 }),
      "Mark broken.",
    );
  });

  it("explains freeze remaining", () => {
    assert.match(freezeCopy({ freezeLeftThisWeek: 1, savedByFreeze: false }), /One freeze/);
    assert.match(freezeCopy({ freezeLeftThisWeek: 0, savedByFreeze: true }), /covered/);
  });
});
