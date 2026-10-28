import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BADGE_DEFS, badgeMetricValue, evaluateBadges, type BadgeContext } from "@inkboard/shared/planner/badges";
import { EMPTY_STATE, fillPrefs, fillTask, type StudyPlan } from "@inkboard/shared/planner/types";

function ctx(over: Partial<BadgeContext> = {}): BadgeContext {
  const plan: StudyPlan = {
    id: "p",
    examId: "YOTUH",
    examName: "NEET",
    name: "NEET",
    prefs: fillPrefs(),
    startDate: "2026-03-02",
    endDate: "2026-03-20",
    active: true,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    courses: [],
    tasks: [
      fillTask({ id: "a", title: "A", type: "lesson", status: "done" }),
      fillTask({ id: "r", title: "R", type: "revision", status: "done" }),
    ],
    reviews: [{ lessonId: "a", stage: 2, dueDate: null, lastRating: "solid", lectureDate: "2026-03-02", lectureCompletedOn: "2026-03-02" }],
  };
  return {
    state: { ...EMPTY_STATE, days: [{ date: "2026-03-04", minutesStudied: 600, tasksDone: 2, updatedAt: "" }] },
    plan,
    streak: { current: 7, longest: 7, freezeUsed: false, countedDates: [], usedWeeks: [], consumedWeeks: [], freezeLeftThisWeek: 1, savedByFreeze: false },
    sessions: [
      { id: "s", date: "2026-03-04", startIso: "", durationMin: 20, subject: "", courseId: null, taskId: null, lessonId: null, notes: "", source: "watch", completed: true, createdAt: "", updatedAt: "", deletedAt: null },
      { id: "m", date: "2026-03-04", startIso: "", durationMin: 20, subject: "", courseId: null, taskId: null, lessonId: null, notes: "", source: "manual", completed: true, createdAt: "", updatedAt: "", deletedAt: null },
      { id: "f", date: "2026-03-04", startIso: "", durationMin: 25, subject: "physics", courseId: null, taskId: null, lessonId: null, notes: "", source: "focus", completed: true, createdAt: "", updatedAt: "", deletedAt: null },
    ],
    comebacks: 3,
    caughtUp: true,
    ...over,
  };
}

describe("badges", () => {
  it("derives metric values from real data", () => {
    const c = ctx();
    assert.equal(badgeMetricValue(c, "lectures"), 1);
    assert.equal(badgeMetricValue(c, "streak"), 7);
    assert.equal(badgeMetricValue(c, "hours"), 10);
    assert.equal(badgeMetricValue(c, "revisions"), 1);
    assert.equal(badgeMetricValue(c, "comebacks"), 3);
    assert.equal(badgeMetricValue(c, "caughtUp"), 1);
    assert.ok(badgeMetricValue(c, "coverage") >= 4);
    assert.equal(badgeMetricValue(c, "focusBlocks"), 1);
  });

  it("marks first-lecture and 7-day streak earned", () => {
    const list = evaluateBadges(ctx());
    assert.ok(list.find((b) => b.id === "first-lecture")?.earned);
    assert.ok(list.find((b) => b.id === "streak-7")?.earned);
    assert.equal(list.find((b) => b.id === "lectures-50")?.earned, false);
    assert.equal(list.length, BADGE_DEFS.length);
  });
});
