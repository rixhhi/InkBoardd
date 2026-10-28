import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { addBookmark, bookmarksFor, formatStamp, revisionBookmarkLine } from "@inkboard/shared/planner/bookmarks";
import { formatClock, shortenDay } from "@inkboard/shared/planner/daily";
import { progressCardStats } from "@inkboard/shared/planner/progress-card";
import { DEFAULT_PROFILE, readProfile, writeProfile } from "@inkboard/shared/planner/profile";
import { syllabusCoverage } from "@inkboard/shared/planner/syllabus";
import { cacheTodayPlan, readTodayCache } from "@inkboard/shared/planner/offline";
import { shouldNudgeBreak, BREAK_EVERY_MS } from "@inkboard/shared/planner/focus";
import { weeklyApplyDiff } from "@inkboard/shared/planner/weekly-apply";
import { fillPrefs, fillTask, type StudyPlan } from "@inkboard/shared/planner/types";

function mockStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      get length() {
        return store.size;
      },
    },
    configurable: true,
  });
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("shorten day", () => {
  it("drops DPP first, then extra lectures down to hardMax-1", () => {
    const tasks = [
      fillTask({ id: "r", title: "Rev", type: "revision", status: "pending" }),
      fillTask({ id: "l1", title: "L1", type: "lesson", status: "pending", orderIdx: 0 }),
      fillTask({ id: "l2", title: "L2", type: "lesson", status: "pending", orderIdx: 1 }),
      fillTask({ id: "l3", title: "L3", type: "lesson", status: "pending", orderIdx: 2 }),
      fillTask({ id: "l4", title: "L4", type: "lesson", status: "pending", orderIdx: 3 }),
      fillTask({ id: "d", title: "DPP", type: "dpp", status: "pending" }),
    ];
    const plan = shortenDay(tasks, 4);
    assert.ok(plan.dropIds.includes("d"));
    assert.equal(plan.dropIds.filter((id) => id !== "d").length, 1);
    assert.ok(plan.keepIds.includes("r"));
    assert.ok(plan.keepIds.includes("l1"));
  });

  it("does nothing when the day is already short", () => {
    const tasks = [fillTask({ id: "l1", title: "L1", type: "lesson", status: "pending" })];
    const plan = shortenDay(tasks, 3);
    assert.deepEqual(plan.dropIds, []);
  });
});

describe("clock 24h", () => {
  it("formats 19:25 as 19:25 when hour12 is off", () => {
    assert.equal(formatClock(19 * 60 + 25, false), "19:25");
    assert.equal(formatClock(19 * 60 + 25, true), "7:25pm");
  });
});

describe("bookmarks", () => {
  it("stores a timestamped note per lesson", () => {
    mockStorage();
    addBookmark({ lessonId: "L1", title: "Optics", seconds: 760, note: "Snell's law" });
    const list = bookmarksFor("L1");
    assert.equal(list.length, 1);
    assert.equal(formatStamp(760), "12:40");
    assert.match(revisionBookmarkLine(["L1"]), /12:40/);
  });
});

describe("syllabus risk", () => {
  it("flags a subject behind the exam date", () => {
    const plan = {
      id: "p",
      examId: "gate",
      examName: "GATE",
      name: "P",
      prefs: fillPrefs({ lecturesPerDay: 2, examDate: "2026-04-01" }),
      startDate: "2026-03-01",
      endDate: "2026-05-01",
      active: true,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      courses: [],
      tasks: [
        fillTask({ id: "a", title: "A", type: "lesson", subject: "Physics", status: "done" }),
        fillTask({ id: "b", title: "B", type: "lesson", subject: "Physics", status: "pending" }),
        fillTask({ id: "c", title: "C", type: "lesson", subject: "Physics", status: "pending" }),
        fillTask({ id: "d", title: "D", type: "lesson", subject: "Physics", status: "pending" }),
        fillTask({ id: "e", title: "E", type: "lesson", subject: "Physics", status: "pending" }),
        fillTask({ id: "f", title: "F", type: "lesson", subject: "Physics", status: "pending" }),
      ],
    } as StudyPlan;
    const cov = syllabusCoverage(plan, "2026-03-30");
    assert.equal(cov[0]!.risk, "behind");
  });
});

describe("weekly apply", () => {
  it("skips the last pending lecture of the week", () => {
    const plan = {
      id: "p",
      examId: "g",
      examName: "G",
      name: "P",
      prefs: fillPrefs(),
      startDate: "2026-03-01",
      endDate: "2026-04-01",
      active: true,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      courses: [],
      tasks: [
        fillTask({ id: "a", title: "Early", type: "lesson", status: "pending", date: "2026-03-04" }),
        fillTask({ id: "b", title: "Late", type: "lesson", status: "pending", date: "2026-03-08" }),
      ],
    } as StudyPlan;
    const diff = weeklyApplyDiff(plan, "2026-03-04", "Protect one extra lecture slot this week.");
    assert.equal(diff.kind, "skip-extra-lecture");
    assert.deepEqual(diff.taskIds, ["b"]);
  });
});

describe("progress card stats", () => {
  it("counts done lectures and hours", () => {
    const plan = {
      id: "p",
      examId: "g",
      examName: "GATE CS",
      name: "Spring",
      prefs: fillPrefs(),
      startDate: "2026-03-01",
      endDate: "2026-04-01",
      active: true,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      courses: [],
      tasks: [
        fillTask({ id: "a", title: "A", type: "lesson", status: "done" }),
        fillTask({ id: "b", title: "B", type: "lesson", status: "pending" }),
      ],
    } as StudyPlan;
    const s = progressCardStats(plan, 4, 150);
    assert.equal(s.streak, 4);
    assert.equal(s.hours, 2.5);
    assert.equal(s.lecturesDone, 1);
    assert.equal(s.lecturesTotal, 2);
  });
});

describe("profile comfort defaults", () => {
  it("fills new comfort fields on old profiles", () => {
    mockStorage();
    localStorage.setItem("inkboard.planner.profile.v1", JSON.stringify({ name: "Asha", streakMode: "any", weeklyMinutes: 400 }));
    const p = readProfile();
    assert.equal(p.name, "Asha");
    assert.equal(p.fontScale, DEFAULT_PROFILE.fontScale);
    assert.equal(p.weekStartsOn, 1);
    assert.equal(p.hour12, true);
    writeProfile({ fontScale: 125, hour12: false });
    assert.equal(readProfile().fontScale, 125);
    assert.equal(readProfile().hour12, false);
  });
});

describe("break nudge", () => {
  it("fires at 40 minutes of play, not before, and not twice", () => {
    assert.equal(shouldNudgeBreak(BREAK_EVERY_MS - 1), false);
    assert.equal(shouldNudgeBreak(BREAK_EVERY_MS), true);
    assert.equal(shouldNudgeBreak(BREAK_EVERY_MS, true), false);
  });
});

describe("offline today cache", () => {
  it("stores today's live tasks for offline use", () => {
    mockStorage();
    const plan = {
      id: "p",
      examId: "g",
      examName: "GATE",
      name: "Spring",
      prefs: fillPrefs(),
      startDate: "2026-03-01",
      endDate: "2026-04-01",
      active: true,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      courses: [],
      tasks: [
        fillTask({ id: "a", title: "Optics", type: "lesson", date: "2026-03-02", status: "pending" }),
        fillTask({ id: "b", title: "Old", type: "lesson", date: "2026-03-01", status: "done" }),
      ],
    } as StudyPlan;
    cacheTodayPlan(plan, "2026-03-02");
    const cache = readTodayCache();
    assert.equal(cache?.planName, "Spring");
    assert.equal(cache?.tasks.length, 1);
    assert.equal(cache?.tasks[0]?.title, "Optics");
  });
});
