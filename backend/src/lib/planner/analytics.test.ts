import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyticsFor } from "@inkboard/shared/planner/analytics";
import { fillDay, fillPrefs, fillTask, type StudyPlan } from "@inkboard/shared/planner/types";
import type { HistoryRow } from "@inkboard/shared/planner/history";

describe("analytics aggregations", () => {
  it("compares minutes, completion and weekly review", () => {
    const plan: StudyPlan = {
      id: "p",
      examId: "YOTUH",
      examName: "NEET",
      name: "NEET",
      prefs: fillPrefs({ startDate: "2026-03-02", dailyMinutes: 30 }),
      startDate: "2026-03-02",
      endDate: "2026-03-20",
      active: true,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      courses: [],
      tasks: [
        fillTask({ id: "a", date: "2026-03-04", title: "A", type: "lesson", status: "done", completedAt: "2026-03-04T12:00:00.000Z", plannedDate: "2026-03-03" }),
        fillTask({ id: "b", date: "2026-03-05", title: "B", type: "lesson", status: "pending" }),
      ],
      reviews: [{ lessonId: "L", stage: 1, dueDate: "2026-03-03", lastRating: "shaky", lectureDate: "2026-03-02", lectureCompletedOn: "2026-03-02" }],
    };
    const rows: HistoryRow[] = [
      {
        id: "s1",
        date: "2026-03-04",
        startIso: "2026-03-04T19:00:00.000Z",
        durationMin: 40,
        subject: "Physics",
        courseId: null,
        taskId: "a",
        lessonId: "L",
        notes: "",
        source: "watch",
        completed: true,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
        teacher: "AG",
        lecture: "A",
        plannedDate: "2026-03-03",
        late: true,
      },
    ];
    const report = analyticsFor({
      plan,
      days: [fillDay({ date: "2026-03-04", minutesStudied: 40, tasksDone: 1 })],
      rows,
      range: { from: "2026-03-04", to: "2026-03-05" },
      prev: { from: "2026-03-02", to: "2026-03-03" },
      today: "2026-03-05",
    });
    assert.equal(report.minutes, 40);
    assert.equal(report.lecturesDone, 1);
    assert.equal(report.bestHour, 19);
    assert.ok(report.procrastinationIndex > 0);
    assert.equal(report.revision.shaky, 1);
    assert.ok(report.weeklyReview.suggestion);
    const forty = report.minutesPerDay.find((d) => d.date === "2026-03-04");
    assert.equal(forty?.minutes, 40);
    assert.ok((forty?.minutes ?? 0) > 0);
  });

  it("charts session minutes even when the study-day log is empty", () => {
    const plan: StudyPlan = {
      id: "p",
      examId: "YOTUH",
      examName: "NEET",
      name: "NEET",
      prefs: fillPrefs({ startDate: "2026-03-02", dailyMinutes: 90 }),
      startDate: "2026-03-02",
      endDate: "2026-03-20",
      active: true,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      courses: [],
      tasks: [],
      reviews: [],
    };
    const rows: HistoryRow[] = [
      {
        id: "s1",
        date: "2026-03-04",
        startIso: "2026-03-04T19:00:00.000Z",
        durationMin: 40,
        subject: "Physics",
        courseId: null,
        taskId: null,
        lessonId: null,
        notes: "",
        source: "manual",
        completed: true,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
        teacher: "",
        lecture: "",
        plannedDate: null,
        late: false,
      },
    ];
    const report = analyticsFor({
      plan,
      days: [],
      rows,
      range: { from: "2026-03-04", to: "2026-03-05" },
      prev: { from: "2026-03-02", to: "2026-03-03" },
      today: "2026-03-05",
    });
    assert.equal(report.minutesPerDay.find((d) => d.date === "2026-03-04")?.minutes, 40);
  });
});
