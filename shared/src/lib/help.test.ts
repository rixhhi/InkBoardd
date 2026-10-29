import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADMIN_HELP_ORDER, HELP, HELP_ORDER, MEMBER_HELP_ORDER, helpTopic, isHelpTopicId } from "./help.ts";

describe("help deck", () => {
  it("every topic is complete: title, where, what, 2+ steps, why", () => {
    for (const t of Object.values(HELP)) {
      assert.ok(t.title.length > 3, `${t.id} title`);
      assert.ok(t.where.length > 3, `${t.id} where`);
      assert.ok(t.what.length > 40, `${t.id} what is too short to explain anything`);
      assert.ok(t.how.length >= 2, `${t.id} needs at least two steps`);
      assert.ok(t.why.length > 40, `${t.id} why`);
      for (const step of t.how) assert.ok(step.length > 10, `${t.id} step too short: ${step}`);
    }
  });

  it("cross-links point at real topics and never at themselves", () => {
    for (const t of Object.values(HELP)) {
      for (const id of t.see ?? []) {
        assert.ok(isHelpTopicId(id), `${t.id} links to unknown ${id}`);
        assert.notEqual(id, t.id, `${t.id} links to itself`);
      }
    }
  });

  it("the Guide order lists every topic exactly once, members first, admin last", () => {
    const ids = Object.keys(HELP).sort();
    assert.deepEqual([...HELP_ORDER].sort(), ids);
    assert.equal(new Set(HELP_ORDER).size, HELP_ORDER.length);
    assert.deepEqual([...MEMBER_HELP_ORDER, ...ADMIN_HELP_ORDER], HELP_ORDER);
    assert.ok(ADMIN_HELP_ORDER.every((id) => id.startsWith("admin-")));
    assert.ok(MEMBER_HELP_ORDER.every((id) => !id.startsWith("admin-")));
  });

  it("helpTopic is total", () => {
    assert.equal(helpTopic(null), null);
    assert.equal(helpTopic("nope"), null);
    assert.equal(helpTopic("ink")?.id, "ink");
  });

  it("math is offered where the UI shows a number the reader might question", () => {
    for (const id of ["ink", "ink-calibration", "revision-intervals"] as const) assert.ok(HELP[id].math, `${id} should explain its math`);
  });
});
