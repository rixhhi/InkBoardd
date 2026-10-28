import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeIdFactory } from "@inkboard/shared/planner/ids";
import {
  describeDiff,
  generatePlan,
  isSchedulableLesson,
  lectureSlots,
  lessonMinutes,
  previewReschedule,
  rateReviewInterval,
  regenerateRemaining,
  rescheduleOverdue,
} from "@inkboard/shared/planner/scheduler";
import { fillPrefs, fillTask, HARD_MAX_LECTURES, type PlanCourseInput, type PlannerPrefs, type PlanTask } from "@inkboard/shared/planner/types";

function prefs(over: Partial<PlannerPrefs> = {}): PlannerPrefs {
  return fillPrefs({
    startDate: "2026-03-02",
    examDate: null,
    studyDays: [1, 2, 3, 4, 5],
    catchUpDay: null,
    includeRevision: false,
    restEvery: 0,
    pace: "steady",
    lecturesPerDay: 3,
    ...over,
  });
}

function lesson(
  id: string,
  title: string,
  rank: number,
  sec = 20 * 60,
  extra: Partial<PlanCourseInput["lessons"][0]> = {},
) {
  return {
    lessonId: id,
    title,
    durationSec: sec,
    rank,
    week: null,
    notesUrl: null,
    dppUrl: null,
    playable: true,
    status: "replay",
    ...extra,
  };
}

function course(id: string, title: string, teacher: string, lessons: PlanCourseInput["lessons"]): PlanCourseInput {
  return { courseId: id, title, teacher, subject: title, lessons };
}

function gen(p: PlannerPrefs, courses: PlanCourseInput[]) {
  return generatePlan(p, courses, { id: makeIdFactory("t") });
}

function lessonsByDate(tasks: PlanTask[]) {
  const map = new Map<string, PlanTask[]>();
  for (const t of tasks.filter((x) => x.type === "lesson")) {
    const list = map.get(t.date) ?? [];
    list.push(t);
    map.set(t.date, list);
  }
  return map;
}

describe("lessonMinutes", () => {
  it("adds a 10 minute notes buffer and respects speed", () => {
    assert.equal(lessonMinutes(50 * 60, 1), 60);
    assert.equal(lessonMinutes(50 * 60, 2), 35);
  });

  it("uses a 20 minute default when duration is 0 or unknown", () => {
    assert.equal(lessonMinutes(0, 1), 30);
    assert.equal(lessonMinutes(Number.NaN, 1), 30);
  });

  it("counts lectures over 60 min at speed as two slots", () => {
    assert.equal(lectureSlots(50 * 60, 1), 1);
    assert.equal(lectureSlots(90 * 60, 1), 2);
    assert.equal(lectureSlots(90 * 60, 2), 1);
  });
});

describe("isSchedulableLesson", () => {
  it("keeps playable/replay and drops upcoming/unavailable/archived", () => {
    assert.equal(isSchedulableLesson(lesson("A", "ok", 1, 60, { playable: true })), true);
    assert.equal(isSchedulableLesson(lesson("B", "no", 1, 60, { playable: false, status: "upcoming" })), false);
    assert.equal(isSchedulableLesson(lesson("C", "no", 1, 60, { playable: false, status: "archived" })), false);
    assert.equal(isSchedulableLesson(lesson("D", "no", 1, 60, { playable: false, status: "unavailable" })), false);
    assert.equal(isSchedulableLesson(lesson("E", "ok", 1, 60, { playable: false, status: "replay" })), true);
  });
});

describe("generatePlan pace", () => {
  it("skips non-study weekdays", () => {
    const c = course("c1", "Physics", "AG", [
      lesson("L1", "One", 1, 20 * 60),
      lesson("L2", "Two", 2, 20 * 60),
      lesson("L3", "Three", 3, 20 * 60),
    ]);
    const { tasks } = gen(prefs({ startDate: "2026-03-06" }), [c]);
    assert.ok(tasks.length >= 3);
    for (const t of tasks.filter((x) => x.type === "lesson")) {
      const day = new Date(+t.date.slice(0, 4), +t.date.slice(5, 7) - 1, +t.date.slice(8, 10)).getDay();
      assert.notEqual(day, 6, t.date);
    }
    assert.equal(tasks.filter((t) => t.type === "lesson")[0]!.date, "2026-03-06");
  });

  it("30 short lectures on steady are 3/day, never 6-8", () => {
    const lessons = Array.from({ length: 30 }, (_, i) => lesson(`L${i}`, `L${i}`, i, 12 * 60));
    const { tasks } = gen(prefs({ pace: "steady", lecturesPerDay: 3, includeRevision: false }), [
      course("c1", "P", "AG", lessons),
    ]);
    const byDate = lessonsByDate(tasks);
    for (const [date, list] of byDate) {
      assert.ok(list.length <= 3, `${date} had ${list.length}`);
    }
    const counts = [...byDate.values()].map((l) => l.length);
    assert.equal(counts.filter((n) => n === 3).length, 10);
    assert.equal(tasks.filter((t) => t.type === "lesson").length, 30);
  });

  it("never exceeds hardMax even when catching up", () => {
    const lessons = Array.from({ length: 20 }, (_, i) => lesson(`L${i}`, `L${i}`, i, 12 * 60));
    const built = gen(prefs({ lecturesPerDay: 3 }), [course("c1", "P", "AG", lessons)]);
    const overdue = built.tasks.map((t, i) => (i < 8 && t.type === "lesson" ? { ...t, date: "2026-02-01" } : t));
    const next = rescheduleOverdue(overdue, prefs({ lecturesPerDay: 3 }), "2026-03-02", "spread");
    const byDate = lessonsByDate(next.filter((t) => t.date >= "2026-03-02"));
    for (const [date, list] of byDate) {
      assert.ok(list.length <= HARD_MAX_LECTURES, `${date} ${list.length}`);
    }
  });

  it("gives a long lecture two slots and its own room if needed", () => {
    const c = course("c1", "Physics", "AG", [lesson("L1", "Long", 1, 120 * 60), lesson("L2", "Short", 2, 12 * 60)]);
    const { tasks } = gen(prefs({ lecturesPerDay: 2, maxNewMinutesPerDay: 80 }), [c]);
    const firstDay = tasks.filter((t) => t.type === "lesson")[0]!.date;
    const first = tasks.filter((t) => t.type === "lesson" && t.date === firstDay);
    assert.equal(first.length, 1);
    assert.equal(first[0]!.lessonId, "L1");
  });

  it("one playlist keeps consecutive order", () => {
    const c = course("c1", "P", "AG", [
      lesson("A", "A", 1, 12 * 60),
      lesson("B", "B", 2, 12 * 60),
      lesson("C", "C", 3, 12 * 60),
    ]);
    const { tasks } = gen(prefs({ lecturesPerDay: 2 }), [c]);
    assert.deepEqual(
      tasks.filter((t) => t.type === "lesson").map((t) => t.lessonId),
      ["A", "B", "C"],
    );
  });

  it("rotates several playlists with at most one each per day", () => {
    const a = course("a", "Physics", "AG", [lesson("P1", "P1", 1, 12 * 60), lesson("P2", "P2", 2, 12 * 60)]);
    const b = course("b", "Chem", "AJ", [lesson("C1", "C1", 1, 12 * 60), lesson("C2", "C2", 2, 12 * 60)]);
    const { tasks } = gen(prefs({ playlistMode: "rotate", lecturesPerDay: 2 }), [a, b]);
    const lessons = tasks.filter((t) => t.type === "lesson");
    assert.deepEqual(
      lessons.map((t) => t.lessonId),
      ["P1", "C1", "P2", "C2"],
    );
    const byDate = lessonsByDate(lessons);
    for (const list of byDate.values()) {
      const courses = new Set(list.map((t) => t.courseId));
      assert.equal(courses.size, list.length);
    }
  });

  it("4 playlists on steady: 3 lectures/day rotating, day 4 has +3 review of day 1", () => {
    const make = (id: string, n: number) =>
      course(
        id,
        id,
        "T",
        Array.from({ length: n }, (_, i) => lesson(`${id}${i}`, `${id}${i}`, i, 12 * 60)),
      );
    const courses = [make("P", 6), make("C", 6), make("M", 6), make("B", 6)];
    const { tasks } = gen(
      prefs({
        playlistMode: "rotate",
        lecturesPerDay: 3,
        includeRevision: true,
        startDate: "2026-03-02",
        studyDays: [1, 2, 3, 4, 5],
        restEvery: 0,
      }),
      courses,
    );
    const lessons = tasks.filter((t) => t.type === "lesson");
    const dates = [...new Set(lessons.map((t) => t.date))].sort();
    assert.equal(lessons.filter((t) => t.date === dates[0]).length, 3);
    assert.equal(lessons.filter((t) => t.date === dates[1]).length, 3);
    const day1 = dates[0]!;
    const day4 = dates[3]!;
    assert.equal(day1, "2026-03-02");
    assert.equal(day4, "2026-03-05");
    const day1Ids = lessons.filter((t) => t.date === day1).map((t) => t.lessonId);
    const rev = tasks.find((t) => t.type === "revision" && t.date === day4);
    assert.ok(rev, "expected revision on day 4");
    assert.ok(day1Ids.some((id) => id && rev!.refLessonIds.includes(id)));
  });

  it("sequential finishes playlist 1 then 2", () => {
    const a = course("a", "Physics", "AG", [lesson("P1", "P1", 1, 12 * 60), lesson("P2", "P2", 2, 12 * 60)]);
    const b = course("b", "Chem", "AJ", [lesson("C1", "C1", 1, 12 * 60), lesson("C2", "C2", 2, 12 * 60)]);
    const { tasks } = gen(prefs({ playlistMode: "sequential", lecturesPerDay: 2 }), [a, b]);
    assert.deepEqual(
      tasks.filter((t) => t.type === "lesson").map((t) => t.lessonId),
      ["P1", "P2", "C1", "C2"],
    );
  });

  it("maps mixMode one-subject to sequential", () => {
    const a = course("a", "Physics", "AG", [lesson("P1", "P1", 1, 12 * 60), lesson("P2", "P2", 2, 12 * 60)]);
    const b = course("b", "Chem", "AJ", [lesson("C1", "C1", 1, 12 * 60), lesson("C2", "C2", 2, 12 * 60)]);
    const { tasks } = gen(prefs({ mixMode: "one-subject", lecturesPerDay: 2 }), [a, b]);
    const byDate = lessonsByDate(tasks);
    for (const set of [...byDate.values()].map((list) => new Set(list.map((t) => t.courseId)))) {
      assert.equal(set.size, 1);
    }
  });

  it("does not silently pack more when the exam date is too soon", () => {
    const lessons = Array.from({ length: 40 }, (_, i) => lesson(`L${i}`, `L${i}`, i, 20 * 60));
    const { tasks, summary } = gen(
      prefs({
        startDate: "2026-03-02",
        examDate: "2026-03-06",
        lecturesPerDay: 3,
        includeRevision: false,
      }),
      [course("c1", "P", "AG", lessons)],
    );
    const byDate = lessonsByDate(tasks);
    for (const list of byDate.values()) assert.ok(list.length <= 3);
    assert.equal(summary.fitsBeforeExam, false);
    assert.ok((summary.requiredLecturesPerDay ?? 0) > 3);
    assert.ok(summary.feasibility);
    assert.ok(summary.feasibility!.extendExamDateBy > 0);
  });

  it("inserts spaced reviews after a lecture, never before, on study days", () => {
    const { tasks } = gen(
      prefs({ includeRevision: true, lecturesPerDay: 1, startDate: "2026-03-02" }),
      [course("c1", "P", "AG", [lesson("L0", "Optics", 0, 12 * 60)])],
    );
    const lecture = tasks.find((t) => t.type === "lesson")!;
    const revs = tasks.filter((t) => t.type === "revision");
    assert.ok(revs.length >= 1);
    for (const r of revs) {
      assert.ok(r.date > lecture.date, r.date);
      const day = new Date(+r.date.slice(0, 4), +r.date.slice(5, 7) - 1, +r.date.slice(8, 10)).getDay();
      assert.ok([1, 2, 3, 4, 5].includes(day), r.date);
      assert.ok(r.refLessonIds.includes("L0"));
    }
  });

  it("bundles at most 3 reviews per day", () => {
    const lessons = Array.from({ length: 12 }, (_, i) => lesson(`L${i}`, `L${i}`, i, 12 * 60));
    const { tasks } = gen(prefs({ includeRevision: true, lecturesPerDay: 3, restEvery: 0 }), [
      course("c1", "P", "AG", lessons),
    ]);
    for (const t of tasks.filter((x) => x.type === "revision")) {
      assert.ok(t.refLessonIds.length <= 3, t.title);
    }
  });

  it("adds a weekly recap on the catch-up day only", () => {
    const lessons = Array.from({ length: 6 }, (_, i) => lesson(`L${i}`, `L${i}`, i, 12 * 60));
    const { tasks } = gen(
      prefs({
        includeRevision: true,
        catchUpDay: 0,
        lecturesPerDay: 3,
        startDate: "2026-03-02",
      }),
      [course("c1", "P", "AG", lessons)],
    );
    const recap = tasks.filter((t) => t.type === "revision" && t.title.startsWith("Weekly recap"));
    assert.ok(recap.length >= 1);
    for (const r of recap) {
      assert.equal(new Date(+r.date.slice(0, 4), +r.date.slice(5, 7) - 1, +r.date.slice(8, 10)).getDay(), 0);
    }
  });

  it("skips holidays and rest days stay at 1 lecture", () => {
    const lessons = Array.from({ length: 12 }, (_, i) => lesson(`L${i}`, `L${i}`, i, 12 * 60));
    const { tasks } = gen(
      prefs({ holidays: ["2026-03-03"], restEvery: 6, lecturesPerDay: 3, includeRevision: false }),
      [course("c1", "P", "AG", lessons)],
    );
    assert.ok(tasks.every((t) => t.date !== "2026-03-03"));
    const byDate = lessonsByDate(tasks);
    const dates = [...byDate.keys()].sort();
    assert.ok((byDate.get(dates[6]!)?.length ?? 0) <= 1);
  });

  it("returns an empty plan with a warning when nothing is playable", () => {
    const c = course("c1", "Physics", "AG", [lesson("U", "Soon", 1, 60, { playable: false, status: "upcoming" })]);
    const { tasks, summary } = gen(prefs(), [c]);
    assert.equal(tasks.length, 0);
    assert.ok(summary.warning);
    assert.equal(summary.playableSkipped, 1);
  });

  it("scales review intervals from a rating", () => {
    assert.equal(rateReviewInterval(8, "shaky"), 4);
    assert.equal(rateReviewInterval(8, "ok"), 8);
    assert.equal(rateReviewInterval(8, "solid"), 12);
  });
});

describe("rescheduleOverdue", () => {
  const p = prefs({ startDate: "2026-03-02" });

  function task(over: Partial<PlanTask>): PlanTask {
    return fillTask({
      id: over.id ?? "x",
      date: "2026-03-02",
      title: "A",
      lessonId: "L1",
      courseId: "c1",
      teacher: "AG",
      durationMin: 30,
      ...over,
    });
  }

  it("push shifts remaining pending tasks forward and leaves completed in place", () => {
    const tasks = [
      task({ id: "done", date: "2026-03-02", status: "done", completedAt: "2026-03-02T10:00:00.000Z" }),
      task({ id: "old", date: "2026-03-02", lessonId: "L2" }),
      task({ id: "fut", date: "2026-03-04", lessonId: "L3" }),
    ];
    const next = rescheduleOverdue(tasks, p, "2026-03-04", "push");
    assert.equal(next.find((t) => t.id === "done")!.date, "2026-03-02");
    assert.ok(next.find((t) => t.id === "old")!.date >= "2026-03-04");
    assert.equal(next.find((t) => t.id === "old")!.rescheduledCount, 1);
  });

  it("spread puts overdue work on upcoming days without exceeding hardMax", () => {
    const tasks = [
      task({ id: "old", date: "2026-03-02", durationMin: 20 }),
      task({ id: "fut", date: "2026-03-04", durationMin: 50, lessonId: "L9" }),
    ];
    const next = rescheduleOverdue(tasks, p, "2026-03-04", "spread");
    assert.equal(next.find((t) => t.id === "fut")!.date, "2026-03-04");
    assert.ok(next.find((t) => t.id === "old")!.date >= "2026-03-04");
  });

  it("skip marks overdue pending tasks skipped and does not touch completed", () => {
    const tasks = [
      task({ id: "done", status: "done", date: "2026-03-02" }),
      task({ id: "old", date: "2026-03-02" }),
      task({ id: "fut", date: "2026-03-05", lessonId: "L3" }),
    ];
    const next = rescheduleOverdue(tasks, p, "2026-03-04", "skip");
    assert.equal(next.find((t) => t.id === "done")!.status, "done");
    assert.equal(next.find((t) => t.id === "old")!.status, "skipped");
    assert.equal(next.find((t) => t.id === "fut")!.date, "2026-03-05");
  });

  it("previewReschedule describes the diff without applying", () => {
    const tasks = [task({ id: "old", date: "2026-03-02" })];
    const { diff } = previewReschedule(tasks, p, "2026-03-04", "spread");
    assert.ok(diff.moved >= 1);
    assert.match(describeDiff(diff), /move/);
    assert.equal(tasks[0]!.date, "2026-03-02");
  });
});

describe("regenerateRemaining", () => {
  it("keeps completed and pinned tasks", () => {
    const courses = [
      course("c1", "P", "AG", [lesson("L1", "One", 1, 12 * 60), lesson("L2", "Two", 2, 12 * 60), lesson("L3", "Three", 3, 12 * 60)]),
    ];
    const built = gen(prefs({ includeRevision: false, lecturesPerDay: 1 }), courses);
    const first = built.tasks.find((t) => t.type === "lesson")!;
    first.status = "done";
    first.completedAt = "2026-03-02T12:00:00.000Z";
    const pin = built.tasks.find((t) => t.lessonId === "L2")!;
    pin.pinned = true;
    pin.date = "2026-03-10";
    const next = regenerateRemaining(built.tasks, prefs({ includeRevision: false, lecturesPerDay: 1 }), courses, "2026-03-04", {
      id: makeIdFactory("n"),
    });
    assert.equal(next.filter((t) => t.status === "done").length, 1);
    assert.equal(next.find((t) => t.lessonId === "L2")!.date, "2026-03-10");
    assert.ok(next.some((t) => t.lessonId === "L3"));
    const done = next.find((t) => t.status === "done")!;
    assert.equal(done.date, first.date);
  });
});

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("generatePlan properties", () => {
  it("holds lecture caps, uniqueness and order across random inputs", () => {
    const rnd = mulberry32(20260302);
    for (let n = 0; n < 24; n += 1) {
      const courseCount = 1 + Math.floor(rnd() * 6);
      const lecturesPerDay = 1 + Math.floor(rnd() * 5);
      const restEvery = rnd() < 0.5 ? 0 : 6;
      const holidays = rnd() < 0.3 ? ["2026-03-04"] : [];
      const includeRevision = rnd() < 0.6;
      const courses: PlanCourseInput[] = [];
      const seenIds = new Set<string>();
      for (let c = 0; c < courseCount; c += 1) {
        const count = Math.floor(rnd() * 40);
        const lessons = Array.from({ length: count }, (_, i) => {
          const id = `c${c}l${i}`;
          seenIds.add(id);
          const mins = 5 + Math.floor(rnd() * 116);
          return lesson(id, id, i, mins * 60, { playable: rnd() > 0.05, status: rnd() > 0.08 ? "replay" : "upcoming" });
        });
        courses.push(course(`c${c}`, `C${c}`, "T", lessons));
      }
      const p = prefs({
        lecturesPerDay,
        restEvery,
        holidays,
        includeRevision,
        playlistMode: courseCount > 1 ? "rotate" : "sequential",
        startDate: "2026-03-02",
        studyDays: [1, 2, 3, 4, 5],
      });
      const { tasks } = gen(p, courses);
      const live = tasks.filter((t) => t.type === "lesson");
      const ids = live.map((t) => t.lessonId).filter((x): x is string => Boolean(x));
      assert.equal(ids.length, new Set(ids).size, `dupes seed iter ${n}`);
      const byDate = lessonsByDate(live);
      for (const [date, list] of byDate) {
        assert.ok(list.length <= HARD_MAX_LECTURES, `${date} ${list.length}`);
        assert.ok(list.length <= lecturesPerDay || restEvery > 0, `${date} ${list.length} > ${lecturesPerDay}`);
        if (restEvery === 0) assert.ok(list.length <= lecturesPerDay, `${date}`);
        const mins = list.reduce((s, t) => s + t.durationMin, 0);
        if (list.length > 1) assert.ok(mins <= p.maxNewMinutesPerDay + 1, `${date} ${mins}`);
      }
      for (const c of courses) {
        const ordered = live.filter((t) => t.courseId === c.courseId);
        for (let i = 1; i < ordered.length; i += 1) {
          assert.ok(ordered[i]!.date >= ordered[i - 1]!.date);
        }
      }
      for (const t of tasks.filter((x) => x.type === "revision")) {
        for (const lid of t.refLessonIds) {
          const src = live.find((l) => l.lessonId === lid);
          if (src) assert.ok(t.date > src.date, `${lid} review ${t.date} vs ${src.date}`);
        }
        const day = new Date(+t.date.slice(0, 4), +t.date.slice(5, 7) - 1, +t.date.slice(8, 10)).getDay();
        if (!t.title.startsWith("Weekly recap")) assert.ok([1, 2, 3, 4, 5].includes(day), t.date);
      }
    }
  });

  it("schedules each playable lesson once for a large playlist", () => {
    const lessons = Array.from({ length: 400 }, (_, i) => lesson(`L${i}`, `L${i}`, i, (10 + (i % 50)) * 60));
    const { tasks } = gen(prefs({ lecturesPerDay: 3, includeRevision: false, restEvery: 6 }), [
      course("big", "OS", "VR", lessons),
    ]);
    const ids = tasks.filter((t) => t.type === "lesson").map((t) => t.lessonId);
    assert.equal(ids.length, 400);
    assert.equal(new Set(ids).size, 400);
  });
});
