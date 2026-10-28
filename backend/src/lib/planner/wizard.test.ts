import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillPrefs, type PlanCourseInput } from "@inkboard/shared/planner/types";
import {
  applyPace,
  chipMeta,
  courseForSubject,
  dailyPreviewCopy,
  estimateHours,
  isPastStart,
  moveIndex,
  orderedCourses,
  playlistBalance,
  requiredPaceCopy,
  sampleDays,
  selectedTotals,
  tomorrowKey,
} from "@inkboard/shared/planner/wizard";
import { generatePlan } from "@inkboard/shared/planner/scheduler";
import { makeIdFactory } from "@inkboard/shared/planner/ids";

function course(id: string, n: number, title = id, subject = title): PlanCourseInput {
  return {
    courseId: id,
    title,
    teacher: "T",
    subject,
    lessons: Array.from({ length: n }, (_, i) => ({
      lessonId: `${id}${i}`,
      title: `${title} ${i}`,
      durationSec: 12 * 60,
      rank: i,
      week: null,
      notesUrl: null,
      dppUrl: null,
      playable: true,
      status: "replay",
    })),
  };
}

describe("applyPace", () => {
  it("sets lecturesPerDay from the named paces and clamps custom 1-5", () => {
    const base = fillPrefs({ startDate: "2026-03-02" });
    assert.equal(applyPace(base, "relaxed").lecturesPerDay, 2);
    assert.equal(applyPace(base, "steady").lecturesPerDay, 3);
    assert.equal(applyPace(base, "intense").lecturesPerDay, 4);
    assert.equal(applyPace(base, "custom", 5).lecturesPerDay, 5);
    assert.equal(applyPace(base, "custom", 9).lecturesPerDay, 5);
    assert.equal(applyPace(base, "custom", 0).lecturesPerDay, 1);
  });
});

describe("playlistBalance", () => {
  it("warns when one playlist is more than twice as long", () => {
    const { warning } = playlistBalance([course("os", 40, "OS"), course("dm", 10, "Discrete")], 1);
    assert.match(warning ?? "", /OS has 40 lectures vs 10 on Discrete/);
  });

  it("is quiet when playlists are close", () => {
    const { warning } = playlistBalance([course("a", 12, "A"), course("b", 10, "B")], 1);
    assert.equal(warning, null);
  });
});

describe("moveIndex / orderedCourses", () => {
  it("reorders without mutating", () => {
    const src = ["a", "b", "c"];
    assert.deepEqual(moveIndex(src, 0, 2), ["b", "c", "a"]);
    assert.deepEqual(src, ["a", "b", "c"]);
  });

  it("honours chip order and appends newly picked courses", () => {
    const a = course("a", 1);
    const b = course("b", 1);
    const picked = { a, b };
    assert.deepEqual(
      orderedCourses(picked, ["b"]).map((c) => c.courseId),
      ["b", "a"],
    );
  });
});

describe("start date helpers", () => {
  it("flags past dates and offers tomorrow", () => {
    assert.equal(isPastStart("2026-03-01", "2026-03-02"), true);
    assert.equal(isPastStart("2026-03-02", "2026-03-02"), false);
    assert.equal(tomorrowKey("2026-03-02"), "2026-03-03");
  });
});

describe("chips and totals", () => {
  it("labels a chip with lecture count and hours", () => {
    const meta = chipMeta(course("p", 10, "Physics"), 1);
    assert.equal(meta.playable, 10);
    assert.match(meta.label, /10 classes/);
    assert.match(meta.label, /h/);
  });

  it("sums selected playlists", () => {
    const totals = selectedTotals([course("p", 10, "P"), course("c", 6, "C")], 1);
    assert.equal(totals.courses, 2);
    assert.equal(totals.playable, 16);
    assert.ok(totals.hours > 0);
  });

  it("estimates hours from a lesson count for suggestions", () => {
    assert.equal(estimateHours(60, 1), 30);
    assert.equal(estimateHours(60, 2), 15);
  });

  it("finds the course already picked for a subject so swap can replace it", () => {
    const physics = course("p", 4, "Mechanics", "Physics");
    const chem = course("c", 4, "Organic", "Chemistry");
    assert.equal(courseForSubject([physics, chem], "Physics")?.courseId, "p");
    assert.equal(courseForSubject([physics, chem], "maths"), undefined);
  });
});

describe("preview copy and sample week", () => {
  it("describes a steady plan and a 7-day sample", () => {
    const prefs = fillPrefs({
      startDate: "2026-03-02",
      studyDays: [1, 2, 3, 4, 5],
      lecturesPerDay: 3,
      includeRevision: true,
      restEvery: 0,
      catchUpDay: null,
    });
    const result = generatePlan(prefs, [course("p", 30, "Physics")], { id: makeIdFactory("w") });
    const copy = dailyPreviewCopy(result, prefs);
    assert.match(copy, /3 lectures/);
    assert.match(copy, /finishes/);
    assert.match(copy, /study day/);
    const sample = sampleDays(result.tasks, 7);
    assert.ok(sample.length <= 7);
    assert.ok(sample[0]!.lectures <= 3);
    assert.match(requiredPaceCopy(3.4, "2026-05-14"), /~3\.4 lectures\/day to finish by 14 May/);
  });
});