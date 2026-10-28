import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FIRST_SITTING } from "@inkboard/shared/planner/day-board";
import { COPY } from "@inkboard/shared/copy";

function src(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("Patina P6 — first sitting", () => {
  it("empty today is two clear actions, not a product tour", () => {
    const onboard = src("../../../frontend/src/components/planner/onboarding.tsx");
    assert.equal(FIRST_SITTING.title, COPY.boardBlank);
    assert.equal(FIRST_SITTING.write, COPY.writeAClassFromWall);
    assert.equal(FIRST_SITTING.plan, COPY.layOutAPlan);
    // The actions are real buttons/links with a one-line explanation each,
    // not numbered rows that read like data (review finding).
    assert.match(onboard, /\{COPY\.layOutAPlan\}/);
    assert.match(onboard, /\{COPY\.writeAClassFromWall\}/);
    assert.match(onboard, /<button[\s\S]*onClick=\{writeClass\}/);
    assert.doesNotMatch(onboard, /chalk-num/);
    assert.match(onboard, /openCommandPalette/);
    assert.match(onboard, /to="\/planner\/new"/);
    assert.doesNotMatch(onboard, /PLAN_TEMPLATES/);
    assert.doesNotMatch(onboard, /TemplateCard/);
    assert.doesNotMatch(onboard, /Skip for now/);
    assert.doesNotMatch(onboard, /The wall already has the exams/);
  });

  it("wizard skips the exam directory when a seal is already on the wall", () => {
    const wizard = src("../../../frontend/src/components/planner/wizard-page.tsx");
    const exam = src("../../../frontend/src/components/planner/wizard-exam.tsx");
    assert.match(wizard, /useSelectedExam/);
    assert.match(wizard, /setStep\(1\)/);
    assert.match(wizard, /writeExamId/);
    assert.match(wizard, /of 4/);
    assert.match(wizard, /eraser-wipe/);
    assert.doesNotMatch(wizard, /Exam, courses, pace, then preview/);
    assert.doesNotMatch(wizard, /examsByGroup/);
    assert.match(exam, /COPY.writeAnExam/);
    assert.match(exam, /SearchInput/);
    assert.match(exam, /access\.exams/, "members only see exams shared with them");
    assert.doesNotMatch(exam, /g.families/);
    assert.doesNotMatch(exam, /examsByGroup/);
    const courses = src("../../../frontend/src/components/planner/wizard-courses.tsx");
    assert.doesNotMatch(courses, /Tick the courses you want/);
  });
});
