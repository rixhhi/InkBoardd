import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LESSON_ID, requireLessonId, UID } from "../../src/dto/ids.ts";
import { ExamHubInput, SearchEducatorsInput, ClassDetailInput, CourseDetailInput } from "@inkboard/shared/ua-input";

describe("dto + validators", () => {
  it("requireLessonId rejects path junk", () => {
    assert.throws(() => requireLessonId("../etc/passwd"), /invalid lesson id/i);
    assert.throws(() => requireLessonId("nope"), /invalid lesson id/i);
    assert.throws(() => requireLessonId(""), /invalid lesson id/i);
    assert.equal(requireLessonId("ABCDEF"), "ABCDEF");
    assert.ok(LESSON_ID.test("lesson_01-x"));
    assert.equal(UID.test(".."), false);
  });

  it("exam hub rejects unknown ids before any fetch", () => {
    assert.throws(() => ExamHubInput.parse({ goalId: "not-an-exam" }), /unknown exam/i);
    const ok = ExamHubInput.parse({ goalId: "YOTUH" });
    assert.equal(ok.goalId, "YOTUH");
  });

  it("search requires two characters", () => {
    assert.throws(() => SearchEducatorsInput.parse({ q: "x" }), /2 characters/);
    const d = SearchEducatorsInput.parse({ q: "pk" });
    assert.equal(d.q, "pk");
  });

  it("class and course ids are alphanumeric", () => {
    assert.throws(() => ClassDetailInput.parse({ uid: ".." }), /invalid class id/i);
    assert.throws(() => CourseDetailInput.parse({ uid: "!!" }), /invalid course id/i);
    assert.equal(ClassDetailInput.parse({ uid: "ABCD" }).uid, "ABCD");
  });
});
