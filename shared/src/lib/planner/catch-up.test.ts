import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { missedMoves } from "./catch-up.ts";

describe("missed work", () => {
  it("keeps pending tasks from earlier days and drops the rest", () => {
    const moved = missedMoves(
      [
        { id: "a", date: "2026-03-01", status: "pending" },
        { id: "b", date: "2026-03-02", status: "done" },
        { id: "c", date: "2026-03-03", status: "pending" },
        { id: "d", date: "2026-03-04", status: "pending", deletedAt: "2026-03-04T00:00:00.000Z" },
      ],
      "2026-03-03",
    );
    assert.deepEqual(moved.map((task) => task.id), ["a"]);
  });

  it("returns nothing for a bad day", () => {
    assert.deepEqual(missedMoves([{ id: "a", date: "2026-03-01", status: "pending" }], "today"), []);
  });
});

describe("fit to exam / study-day guard / topic overlap", () => {
  it("fitToExam raises lectures per day and the minute budget until the plan ends by the exam", async () => {
    const { fitToExam } = await import("./wizard.ts");
    const { generatePlan } = await import("./scheduler.ts");
    const { DEFAULT_PREFS } = await import("./types.ts");
    const lessons = Array.from({ length: 24 }, (_, i) => ({ lessonId: `L${i}`, title: `L${i}`, durationSec: 2400, rank: i, week: null, notesUrl: null, dppUrl: null, playable: true, status: "replay" }));
    const prefs = { ...DEFAULT_PREFS, startDate: "2026-11-02", examDate: "2026-11-14", dailyMinutes: 60, lecturesPerDay: 1, pace: "custom" as const };
    const before = generatePlan(prefs, [{ courseId: "A", title: "A", teacher: "T", lessons }]);
    assert.equal(before.summary.fitsBeforeExam, false);
    const courses = [{ courseId: "A", title: "A", teacher: "T", lessons }];
    const fit = fitToExam(prefs, courses);
    assert.ok(fit.enough, JSON.stringify(fit));
    assert.ok(fit.lecturesPerDay > 1);
    assert.ok(fit.endDate <= "2026-11-14", `ends ${fit.endDate}`);
    const after = generatePlan(fit.prefs, courses);
    assert.equal(after.endDate, fit.endDate, "the returned prefs reproduce the fitted plan");
    // Already fits: unchanged.
    const ok = fitToExam({ ...prefs, examDate: "2027-03-01" }, courses);
    assert.equal(ok.enough, true);
    assert.equal(ok.lecturesPerDay, 1);
  });

  it("fitToExam reports 'not enough' when even the hard cap cannot make it", async () => {
    const { fitToExam } = await import("./wizard.ts");
    const { DEFAULT_PREFS } = await import("./types.ts");
    const lessons = Array.from({ length: 60 }, (_, i) => ({ lessonId: `L${i}`, title: `L${i}`, durationSec: 3600, rank: i, week: null, notesUrl: null, dppUrl: null, playable: true, status: "replay" }));
    const fit = fitToExam({ ...DEFAULT_PREFS, startDate: "2026-11-02", examDate: "2026-11-04" }, [{ courseId: "A", title: "A", teacher: "T", lessons }]);
    assert.equal(fit.enough, false);
    assert.equal(fit.lecturesPerDay, 5);
    assert.equal(fit.dailyMinutes, 480);
    assert.ok(fit.endDate > "2026-11-04");
  });

  it("toggleStudyDay never empties the set (empty means every day to the scheduler)", async () => {
    const { toggleStudyDay } = await import("./wizard.ts");
    assert.deepEqual(toggleStudyDay([1, 2], 2), [1]);
    assert.deepEqual(toggleStudyDay([1], 1), [1]);
    assert.deepEqual(toggleStudyDay([3, 1], 2), [1, 2, 3]);
  });

  it("overlappingTopics finds the same chapter in two courses, ignoring part/lecture numbers", async () => {
    const { overlappingTopics } = await import("./scheduler/feasibility.ts");
    const mk = (id: string, topics: string[]) => ({ courseId: id, title: id, teacher: "T", lessons: topics.map((t, i) => ({ lessonId: `${id}${i}`, title: t, durationSec: 1800, rank: i, week: null, notesUrl: null, dppUrl: null, playable: true, status: "replay", topic: t })) });
    const out = overlappingTopics([mk("Phys A", ["Kinematics Part 1", "Kinematics Part 2", "Work & Energy"]), mk("Phys B", ["Kinematics - L1", "Thermodynamics"]), mk("Chem", ["Thermodynamics"])]);
    const topics = out.map((o) => o.topic.toLowerCase());
    assert.ok(topics.some((t) => t.startsWith("kinematics")), JSON.stringify(out));
    assert.ok(topics.includes("thermodynamics"));
    assert.equal(out.find((o) => o.topic.toLowerCase().startsWith("kinematics"))?.lessons, 3);
    assert.deepEqual(overlappingTopics([mk("A", ["X"]), mk("B", ["Y"])]), []);
  });
});

describe("no tasks after the exam", () => {
  it("reviews and recaps are never scheduled past examDate", async () => {
    const { generatePlan } = await import("./scheduler.ts");
    const { DEFAULT_PREFS } = await import("./types.ts");
    const lessons = Array.from({ length: 10 }, (_, i) => ({ lessonId: `L${i}`, title: `L${i}`, durationSec: 1800, rank: i, week: null, notesUrl: null, dppUrl: null, playable: true, status: "replay" }));
    const r = generatePlan({ ...DEFAULT_PREFS, startDate: "2026-11-02", examDate: "2026-11-12", lecturesPerDay: 5, pace: "custom", dailyMinutes: 300, maxNewMinutesPerDay: 300, catchUpDay: 0 }, [{ courseId: "A", title: "A", teacher: "T", lessons }]);
    const late = r.tasks.filter((t) => t.date > "2026-11-12");
    assert.deepEqual(late.map((t) => `${t.type}@${t.date}`), []);
    assert.ok(r.tasks.some((t) => t.type === "revision"), "reviews inside the window still exist");
    assert.equal(r.summary.fitsBeforeExam, true);
    // Without an exam date nothing is clamped.
    const open = generatePlan({ ...DEFAULT_PREFS, startDate: "2026-11-02", examDate: null, lecturesPerDay: 5, pace: "custom", dailyMinutes: 300, maxNewMinutesPerDay: 300 }, [{ courseId: "A", title: "A", teacher: "T", lessons }]);
    assert.ok(open.tasks.some((t) => t.type === "revision" && t.date > "2026-11-12"));
  });
});
