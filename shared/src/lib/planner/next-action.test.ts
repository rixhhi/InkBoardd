import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextAction } from "./next-action.ts";
import { nextIntervalDays } from "./review-gap.ts";

describe("today's next step", () => {
  it("puts missed classes ahead of a half-watched lecture", () => {
    const action = nextAction({
      overdue: 2,
      pending: [{ title: "Optics", lessonId: "L1" }],
      resume: { title: "Optics", lessonId: "L1", seconds: 40 },
    });
    assert.equal(action.kind, "catch-up");
  });

  it("resumes the next class when it is already started", () => {
    const action = nextAction({
      overdue: 0,
      pending: [{ title: "Optics", lessonId: "L1" }],
      resume: { title: "Optics", lessonId: "L1", seconds: 40 },
    });
    assert.equal(action.kind, "resume");
    assert.equal(action.href, "/play/L1?t=40");
  });

  it("rests when the day is clear", () => {
    assert.equal(nextAction({ overdue: 0, pending: [], resume: null }).kind, "rest");
  });
});

describe("review gap", () => {
  it("waits longer after a solid recall than an ok one, and never less than a day", () => {
    for (const previous of [1, 3, 8]) {
      const shaky = nextIntervalDays(previous, "shaky");
      const ok = nextIntervalDays(previous, "ok");
      const solid = nextIntervalDays(previous, "solid");
      assert.equal(shaky, 1);
      assert.ok(solid > ok);
      assert.ok(ok >= 1);
    }
    assert.equal(nextIntervalDays(0, "ok"), nextIntervalDays(Number.NaN, "ok"));
  });
});
