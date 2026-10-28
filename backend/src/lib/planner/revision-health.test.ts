import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lectureTitlesFor, revisionHealth } from "@inkboard/shared/planner/revision-health";
import { fillPlan, fillTask } from "@inkboard/shared/planner/types";

describe("revision health", () => {
  const plan = fillPlan({
    id: "p1",
    examId: "NVLIA",
    name: "GATE",
    tasks: [
      fillTask({ id: "l1", title: "DFA", lessonId: "L1", type: "lesson", date: "2026-03-01", status: "done" }),
      fillTask({
        id: "r1",
        title: "Revise: DFA",
        type: "revision",
        date: "2026-03-02",
        status: "pending",
        refLessonIds: ["L1"],
      }),
      fillTask({
        id: "r2",
        title: "Revise: NFA",
        type: "revision",
        date: "2026-03-01",
        status: "pending",
        refLessonIds: ["L2"],
      }),
    ],
    reviews: [
      { lessonId: "L1", stage: 1, dueDate: "2026-03-02", lastRating: "shaky", lectureDate: "2026-03-01", lectureCompletedOn: "2026-03-01" },
      { lessonId: "L2", stage: 2, dueDate: "2026-03-08", lastRating: "solid", lectureDate: "2026-02-20", lectureCompletedOn: "2026-02-20" },
    ],
    courses: [
      {
        courseId: "c1",
        title: "TOC",
        teacher: "Ankit",
        lessons: [
          { lessonId: "L1", title: "DFA", durationSec: 1200, rank: 1, week: 1, notesUrl: null, dppUrl: null, playable: true },
          { lessonId: "L2", title: "NFA", durationSec: 1200, rank: 2, week: 1, notesUrl: null, dppUrl: null, playable: true },
        ],
      },
    ],
  });

  it("splits due, overdue and shaky", () => {
    const h = revisionHealth(plan, "2026-03-02");
    assert.equal(h.due.length, 1);
    assert.equal(h.overdue.length, 1);
    assert.equal(h.shaky.length, 1);
    assert.equal(h.solid, 1);
  });

  it("resolves lecture titles from the plan", () => {
    const titles = lectureTitlesFor(plan, ["L1", "L2"]);
    assert.equal(titles[0]!.title, "DFA");
    assert.equal(titles[1]!.title, "NFA");
  });

  it("does not throw when a stored course has no lessons array", () => {
    const skinny = fillPlan({
      ...plan,
      courses: [{ courseId: "c1", title: "TOC", teacher: "Ankit", lessons: undefined as never }],
    });
    const titles = lectureTitlesFor(skinny, ["L1"]);
    assert.equal(titles[0]!.title, "DFA");
  });
});
