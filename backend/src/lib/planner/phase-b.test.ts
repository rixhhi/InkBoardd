import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inQuietHours, reminderHourOf, scheduleInAppBanner } from "@inkboard/shared/planner/reminders";
import { lectureChipLabel, lectureTitlesFor, revisionHealth } from "@inkboard/shared/planner/revision-health";
import { freezeCopy, nextStreakMilestone, streakStateLabel } from "@inkboard/shared/planner/streak-copy";
import { PLAN_TEMPLATES, prefsFromTemplate, wizardSearchFromTemplate } from "@inkboard/shared/planner/templates";
import { fillPlan, fillPrefs, fillTask, type StudyPlan } from "@inkboard/shared/planner/types";
import { isBehind, oldestOverdueIds } from "@inkboard/shared/planner/daily";
import { describeDiff } from "@inkboard/shared/planner/scheduler";

describe("phase B templates", () => {
  it("quick-start templates fill exam date and pace", () => {
    const gate = PLAN_TEMPLATES.find((t) => t.id === "gate-cs-90")!;
    const prefs = prefsFromTemplate(gate, "2026-01-01");
    assert.equal(prefs.pace, "steady");
    assert.equal(prefs.lecturesPerDay, 3);
    assert.equal(prefs.examDate, "2026-04-01");
    const search = wizardSearchFromTemplate(gate);
    assert.equal(search.exam, "NVLIA");
    assert.equal(search.template, "gate-cs-90");
  });
});

describe("phase B reminders", () => {
  it("quiet hours wrap midnight", () => {
    assert.equal(inQuietHours(23, 22, 7), true);
    assert.equal(inQuietHours(6, 22, 7), true);
    assert.equal(inQuietHours(8, 22, 7), false);
    assert.equal(inQuietHours(12, 12, 12), false);
  });

  it("banner is silent in quiet hours and when nothing is pending", () => {
    const prefs = fillPrefs({ reminders: true, quietStart: 22, quietEnd: 7, timeSlot: "evening" });
    const pending = [fillTask({ id: "t1", title: "A", date: "2026-03-08", status: "pending" })];
    assert.equal(scheduleInAppBanner(prefs, pending, new Date(2026, 2, 8, 23, 0, 0)), null);
    const evening = scheduleInAppBanner(prefs, pending, new Date(2026, 2, 8, 19, 0, 0));
    assert.match(evening ?? "", /1 class/);
    assert.equal(reminderHourOf(fillPrefs({ timeSlot: "morning" })), 7);
  });
});

describe("phase B streak copy", () => {
  it("names at-risk, freeze, and the next milestone", () => {
    assert.match(streakStateLabel({ current: 4, atRisk: true, savedByFreeze: false, freezeLeft: 1, comebacks: 0 }), /Mark at risk/);
    assert.equal(nextStreakMilestone(7).at, 14);
    assert.match(freezeCopy({ freezeLeftThisWeek: 1, savedByFreeze: false }), /One freeze/);
  });
});

describe("phase B revision + behind", () => {
  it("lists due / overdue / shaky revision with lecture dates on chips", () => {
    const plan: StudyPlan = fillPlan({
      id: "p",
      examId: "NVLIA",
      name: "GATE",
      tasks: [
        fillTask({ id: "l1", type: "lesson", lessonId: "L1", title: "TOC 1", date: "2026-03-01", plannedDate: "2026-03-01", status: "done" }),
        fillTask({
          id: "r1",
          type: "revision",
          title: "Revise: TOC 1",
          date: "2026-03-08",
          status: "pending",
          refLessonIds: ["L1"],
        }),
        fillTask({
          id: "r0",
          type: "revision",
          title: "Revise: old",
          date: "2026-03-01",
          status: "pending",
          refLessonIds: ["L1"],
        }),
      ],
      reviews: [
        {
          lessonId: "L1",
          stage: 1,
          dueDate: "2026-03-08",
          lastRating: "shaky",
          lectureDate: "2026-03-01",
          lectureCompletedOn: "2026-03-01",
        },
      ],
    });
    const health = revisionHealth(plan, "2026-03-08");
    assert.equal(health.due.length, 1);
    assert.equal(health.overdue.length, 1);
    assert.equal(health.shaky.length, 1);
    const chip = lectureTitlesFor(plan, ["L1"])[0]!;
    assert.equal(chip.title, "TOC 1");
    assert.equal(chip.date, "2026-03-01");
    assert.match(lectureChipLabel(chip), /03-01/);
  });

  it("behind means 2+ overdue study days; skip oldest takes that day only", () => {
    const tasks = [
      fillTask({ id: "a", title: "A", date: "2026-03-02", status: "pending", type: "lesson" }),
      fillTask({ id: "b", title: "B", date: "2026-03-02", status: "pending", type: "lesson" }),
      fillTask({ id: "c", title: "C", date: "2026-03-04", status: "pending", type: "lesson" }),
    ];
    assert.equal(isBehind(tasks, "2026-03-08", fillPrefs()), true);
    assert.deepEqual(oldestOverdueIds(tasks, "2026-03-08"), ["a", "b"]);
  });

  it("rebuild diff copy is human, not internal jargon", () => {
    assert.match(describeDiff({ moved: 12, skipped: 0, added: 0, removed: 0, finishBefore: "2026-03-04", finishAfter: "2026-03-09" }), /12/);
    assert.doesNotMatch(describeDiff({ moved: 1, skipped: 0, added: 0, removed: 0, finishBefore: "a", finishAfter: "b" }), /tombstone|delta|hydrate/i);
  });
});
