import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prefsFromTemplate, PLAN_TEMPLATES, templateById, wizardSearchFromTemplate } from "@inkboard/shared/planner/templates";

describe("plan templates", () => {
  it("has GATE, JEE, NEET and custom", () => {
    assert.deepEqual(
      PLAN_TEMPLATES.map((t) => t.id),
      ["gate-cs-90", "jee-6m", "neet-6m", "custom"],
    );
  });

  it("GATE 90 days sets an exam date 90 days out", () => {
    const t = templateById("gate-cs-90")!;
    const prefs = prefsFromTemplate(t, "2026-01-01");
    assert.equal(prefs.examDate, "2026-04-01");
    assert.equal(prefs.pace, "steady");
    assert.equal(prefs.lecturesPerDay, 3);
  });

  it("custom has no exam and no deadline", () => {
    const t = templateById("custom")!;
    const prefs = prefsFromTemplate(t, "2026-01-01");
    assert.equal(t.examId, null);
    assert.equal(prefs.examDate, null);
    const search = wizardSearchFromTemplate(t);
    assert.equal(search.exam, undefined);
  });
});
