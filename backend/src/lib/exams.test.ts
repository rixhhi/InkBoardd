import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  examGoalIds,
  examMatchesGoal,
  examSeal,
  getExam,
  groupTeachersBySubject,
  iconicSubjectGoal,
  teacherSubject,
} from "@inkboard/shared/exams";

describe("exam helpers", () => {
  it("resolves GATE CS and Iconic Pro", () => {
    const cs = getExam("NVLIA");
    const iconic = getExam("gate-iconic-pro");
    assert.equal(cs?.name, "GATE CS");
    assert.equal(iconic?.name, "GATE Iconic Pro");
    assert.ok(examGoalIds(iconic!).includes("NVLIA"));
    assert.ok(examGoalIds(iconic!).includes("PZSIU"));
    assert.deepEqual(examGoalIds(cs!), ["NVLIA"]);
  });

  it("matches a class goal against the selected exam", () => {
    const iconic = getExam("CNFPR")!;
    assert.equal(examMatchesGoal(iconic, "NVLIA"), true);
    assert.equal(examMatchesGoal(iconic, "NOPE"), false);
    assert.equal(examMatchesGoal(null, "NVLIA"), true);
  });

  it("maps Iconic Pro subjects onto GATE papers", () => {
    assert.equal(iconicSubjectGoal("Compiler Design"), "NVLIA");
    assert.equal(iconicSubjectGoal("Civil Engineering"), "PZSIU");
    assert.equal(iconicSubjectGoal("Electrical machines"), "JAQRK");
    assert.equal(iconicSubjectGoal("something else"), null);
  });

  it("groups teachers by subject, General last", () => {
    assert.equal(teacherSubject("Teaches Compiler Design and 12 more"), "Compiler Design");
    const groups = groupTeachersBySubject([
      { topics: "Teaches Physics" },
      { topics: "Teaches Physics" },
      { topics: "" },
      { topics: "Teaches Chemistry" },
    ]);
    assert.equal(groups[0]![0], "Physics");
    assert.equal(groups[0]![1].length, 2);
    assert.equal(groups.at(-1)![0], "General");
  });

  it("seals exams as 2–4 letter inscriptions", () => {
    assert.equal(examSeal(getExam("TMUVD")), "JEE");
    assert.equal(examSeal(getExam("YOTUH")), "NEET");
    assert.equal(examSeal(getExam("NVLIA")), "GATE");
    assert.equal(examSeal(getExam("KSCGY")), "UPSC");
    assert.equal(examSeal(getExam("RXRWJ")), "CA");
    assert.equal(examSeal(getExam("MCRYW")), "CS");
    assert.equal(examSeal(getExam("SIFWL")), "JAM");
    assert.equal(examSeal(null), "");
  });
});
