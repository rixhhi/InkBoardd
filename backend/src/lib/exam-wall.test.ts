import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canonicalTopic,
  courseOnTopic,
  coursePrimaryTopic,
  courseSeal,
  daysToExamLine,
  frameCrowd,
  isBroadCourseName,
  isGenericTopic,
  isPlateSubject,
  matchesTopic,
  plateCaption,
  subjectKey,
  topicFitsName,
  topicsTaught,
} from "@inkboard/shared/exam-wall";

describe("exam wall copy", () => {
  it("writes days-to-exam as a caption, never a badge", () => {
    assert.equal(daysToExamLine(184, "JEE"), "184 days to JEE");
    assert.equal(daysToExamLine(1, "NEET"), "1 day to NEET");
    assert.equal(daysToExamLine(0, "GATE"), "GATE is today");
    assert.equal(daysToExamLine(-2, "UPSC"), "2 days past UPSC");
    assert.equal(daysToExamLine(null, "JEE"), null);
    assert.equal(daysToExamLine(12, ""), null);
  });

  it("captions a plate from counts, folding playlists into courses", () => {
    assert.equal(plateCaption({ courses: 12, live: 3 }), "12 courses · 3 live");
    assert.equal(plateCaption({ courses: 1, playlists: 1 }), "2 courses");
    assert.equal(plateCaption({ playlists: 1 }), "1 course");
    assert.equal(plateCaption({}), "On this wall");
    assert.doesNotMatch(plateCaption({ courses: 11, playlists: 1 }), /playlist/i);
  });

  it("matches subject names without requiring exact strings", () => {
    assert.equal(canonicalTopic("CS & IT"), "cs and it");
    assert.equal(matchesTopic("Organic Chemistry", "Chemistry"), true);
    assert.equal(matchesTopic("Physics", "Biology"), false);
    assert.equal(matchesTopic("anything", "all"), true);
  });

  it("frames a crowd as words, never K learners", () => {
    assert.equal(frameCrowd(0), "");
    assert.equal(frameCrowd(850), "850");
    assert.equal(frameCrowd(1200), "1 thousand");
    assert.equal(frameCrowd(94200), "94 thousand");
    assert.equal(frameCrowd(1_000_000), "1 million");
    assert.doesNotMatch(frameCrowd(94200), /learners|K\b/i);
  });

  it("skips catalog leftovers like Special class as a seal", () => {
    assert.equal(isGenericTopic("Special class"), true);
    assert.equal(isGenericTopic("Physics"), false);
    assert.equal(
      courseSeal([{ name: "Special class", level: 15 }, { name: "Physics", level: 15 }], "Hinglish"),
      "Physics",
    );
    assert.equal(courseSeal([{ name: "Special class", level: 15 }], "Hinglish"), "Hinglish");
    assert.equal(courseSeal([], null), "Course");
    assert.equal(
      courseSeal(
        [
          { name: "Mathematical Methods", level: 15 },
          { name: "Computer Networks", level: 15 },
        ],
        "Hinglish",
        "Computer Networks For LT GRADE",
      ),
      "Computer Networks",
    );
    assert.equal(
      courseSeal([{ name: "Mathematical Methods", level: 15 }], "Hinglish", "Computer Networks For LT GRADE"),
      "Hinglish",
    );
    assert.equal(isPlateSubject("GATE & ESE - Civil"), false);
    assert.equal(isPlateSubject("CBSE Class 11"), false);
    assert.equal(isPlateSubject("General Studies"), false);
    assert.equal(isPlateSubject("Data Structures"), true);
  });
});

const soup = [
  { uid: "math", name: "Mathematics", level: 15, parent: "Computer Science" },
  { uid: "ds", name: "Data Structures", level: 15, parent: "Computer Science" },
  { uid: "algo", name: "Algorithms", level: 15, parent: "Computer Science" },
];

describe("teacher topics ignore Unacademy tag soup", () => {
  it("aliases maths and ds", () => {
    assert.equal(subjectKey("Maths"), "mathematics");
    assert.equal(subjectKey("DSA"), "data structures");
    assert.equal(topicFitsName("Mathematics", "Engineering Maths for GATE"), true);
    assert.equal(topicFitsName("Data Structures", "DSA — Trees"), true);
  });

  it("picks the subject in the title, not the first tag", () => {
    const primary = coursePrimaryTopic(soup, "Data Structures — Trees and Graphs");
    assert.equal(primary?.name, "Data Structures");
    assert.equal(courseOnTopic({ name: "Data Structures — Trees and Graphs", topics: soup }, { uid: "math", name: "Mathematics" }), false);
    assert.equal(courseOnTopic({ name: "Data Structures — Trees and Graphs", topics: soup }, { uid: "ds", name: "Data Structures" }), true);
  });

  it("does not invent Maths on a complete GATE CS course", () => {
    assert.equal(isBroadCourseName("GATE CS 2026 Complete Course"), true);
    const primary = coursePrimaryTopic(soup, "GATE CS 2026 Complete Course");
    assert.equal(primary, null);
    assert.equal(courseOnTopic({ name: "GATE CS 2026 Complete Course", topics: soup }, { name: "Mathematics" }), false);
    assert.equal(courseOnTopic({ name: "GATE CS 2026 Complete Course", topics: soup }, { name: "Data Structures" }), false);
    assert.equal(
      coursePrimaryTopic([{ uid: "cs", name: "CS & IT", level: 15 }], "Unacademy Learning Experience: Complete GATE Platform Walkthrough"),
      null,
    );
  });

  it("lists only subjects the teacher actually teaches", () => {
    const taught = topicsTaught([
      { name: "Data Structures — Part I", topics: soup },
      { name: "Algorithms — Sorting", topics: soup },
      { name: "GATE CS 2026 Complete Course", topics: soup },
      { name: "Engineering Mathematics — Linear Algebra", topics: soup },
    ]);
    const names = taught.map((t) => t.name);
    assert.ok(names.includes("Data Structures"));
    assert.ok(names.includes("Algorithms"));
    assert.ok(names.includes("Mathematics"));
    assert.equal(names.filter((n) => n === "Mathematics").length, 1);
    assert.equal(taught.find((t) => t.name === "Mathematics")?.courseCount, 1);
  });

  it("teacher shelf filters by primary subject, not every Unacademy tag", () => {
    const src = readFileSync(new URL("../../../frontend/src/components/educator-catalog.tsx", import.meta.url), "utf8");
    assert.match(src, /topicsTaught/);
    assert.match(src, /courseOnTopic/);
    assert.doesNotMatch(src, /c\.topics\.some\(\(t\) => t\.uid === activeTopic/);
  });
});
