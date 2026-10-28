import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFreeze, computeStreaks, comebackCount, dayQualifies, isCaughtUp, planPace, streakAtRisk } from "@inkboard/shared/planner/streaks";
import { fillDay, fillPrefs, fillTask, type PlanTask, type StudyDayLog, type StudyPlan } from "@inkboard/shared/planner/types";

function log(date: string, minutes = 30, tasksDone = 1): StudyDayLog {
  return fillDay({ date, minutesStudied: minutes, tasksDone });
}

function task(date: string, status: PlanTask["status"] = "done"): PlanTask {
  return fillTask({
    id: date,
    date,
    title: "T",
    lessonId: "L",
    courseId: "c",
    teacher: "AG",
    durationMin: 30,
    status,
    completedAt: status === "done" ? `${date}T12:00:00.000Z` : null,
  });
}

const weekdays = fillPrefs({ startDate: "2026-03-02", studyDays: [1, 2, 3, 4, 5], catchUpDay: 0 });

describe("dayQualifies", () => {
  it("counts a day with a done task or enough minutes", () => {
    assert.equal(dayQualifies(log("2026-03-02", 5, 1), [], "2026-03-02", 20), true);
    assert.equal(dayQualifies(log("2026-03-02", 25, 0), [], "2026-03-02", 20), true);
    assert.equal(dayQualifies(undefined, [task("2026-03-02")], "2026-03-02", 20), true);
    assert.equal(dayQualifies(log("2026-03-02", 5, 0), [], "2026-03-02", 20), false);
  });
});

describe("computeStreaks", () => {
  it("counts consecutive qualifying days ending yesterday if today is empty", () => {
    const days = [log("2026-03-02"), log("2026-03-03"), log("2026-03-04")];
    const r = computeStreaks(days, [], [], "2026-03-05", 20);
    assert.equal(r.current, 3);
    assert.ok(r.longest >= 3);
  });

  it("uses one freeze per ISO week to protect a missed day", () => {
    const days = [log("2026-03-02"), log("2026-03-04")];
    const r = computeStreaks(days, [], [], "2026-03-04", 20);
    assert.ok(r.current >= 2);
    assert.ok(r.usedWeeks.includes("2026-W10"));
    assert.equal(r.savedByFreeze, true);
  });

  it("a stored freeze still protects exactly one miss in that week", () => {
    const days = [log("2026-03-02"), log("2026-03-04")];
    const r = computeStreaks(days, [], ["2026-W10"], "2026-03-04", 20);
    assert.ok(r.current >= 2);
    assert.equal(r.freezeLeftThisWeek, 0);
  });

  it("does not reuse a freeze already stored for a second miss in that week", () => {
    // Mon done, Tue miss (freeze), Wed miss, Thu done.
    const days = [log("2026-03-02"), log("2026-03-05")];
    const r = computeStreaks(days, [], ["2026-W10"], "2026-03-05", 20);
    assert.equal(r.current, 1);
  });

  it("off days neither count nor break the streak", () => {
    const days = [log("2026-03-06"), log("2026-03-09")];
    const r = computeStreaks(days, [], [], "2026-03-09", 20, weekdays);
    assert.ok(r.current >= 2, `current=${r.current}`);
  });

  it("year boundary freeze weeks are distinct", () => {
    const days = [log("2025-12-31"), log("2026-01-02")];
    const r = computeStreaks(days, [], [], "2026-01-02", 20);
    assert.ok(r.usedWeeks.length >= 1);
  });
});

describe("applyFreeze", () => {
  it("records a week at most once", () => {
    const once = applyFreeze([], "2026-03-03");
    assert.equal(once.length, 1);
    assert.deepEqual(applyFreeze(once, "2026-03-04"), once);
  });
});

describe("computeStreaks bounds", () => {
  it("ignores invalid dates instead of walking forever", () => {
    const r = computeStreaks([], [task("")], [], "2026-03-05", 20);
    assert.equal(r.current, 0);
  });
});

describe("planPace", () => {
  it("projects finish from trailing pace and reports days ahead/behind", () => {
    const p: StudyPlan = {
      id: "p",
      examId: "YOTUH",
      examName: "NEET",
      name: "NEET",
      prefs: fillPrefs({ startDate: "2026-03-02", dailyMinutes: 60, studyDays: [1, 2, 3, 4, 5] }),
      startDate: "2026-03-02",
      endDate: "2026-03-20",
      active: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      deletedAt: null,
      courses: [],
      tasks: [
        fillTask({ id: "a", date: "2026-03-02", title: "A", status: "done", durationMin: 60 }),
        fillTask({ id: "b", date: "2026-03-20", title: "B", status: "pending", durationMin: 60 }),
      ],
    };
    const slow = planPace(p, "2026-03-04", [log("2026-03-02", 10), log("2026-03-03", 10)]);
    const fast = planPace(p, "2026-03-04", [log("2026-03-02", 180), log("2026-03-03", 180)]);
    assert.ok(slow.projectedFinish);
    assert.ok(fast.projectedFinish);
    assert.ok(fast.projectedFinish! <= slow.projectedFinish!);
    assert.equal(typeof slow.daysDelta, "number");
    assert.equal(typeof slow.lessonsDelta, "number");
  });
});

describe("streakAtRisk", () => {
  it("flags a work day after 6pm with nothing done", () => {
    const prefs = fillPrefs({ startDate: "2026-03-02", studyDays: [1, 2, 3, 4, 5] });
    const evening = new Date(2026, 2, 2, 19, 0, 0);
    assert.equal(streakAtRisk(prefs, "2026-03-02", [], [], evening), true);
    assert.equal(streakAtRisk(prefs, "2026-03-02", [log("2026-03-02")], [], evening), false);
  });
});

describe("comeback and catch-up", () => {
  it("counts a return after 3 idle work days", () => {
    const days = [log("2026-03-02"), log("2026-03-09")];
    assert.equal(comebackCount(days, [], "2026-03-09", 20), 1);
  });

  it("caught up means overdue finished today with none left", () => {
    const tasks = [
      fillTask({ id: "a", title: "A", date: "2026-03-02", plannedDate: "2026-03-02", status: "done", completedAt: "2026-03-05T12:00:00.000Z", type: "lesson" }),
    ];
    assert.equal(isCaughtUp(tasks, "2026-03-05"), true);
  });
});
