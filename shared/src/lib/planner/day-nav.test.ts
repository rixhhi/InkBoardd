import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DAY_NAV_MAX_AHEAD, canStepDay, dayFromSearch, dayNavLabel, dayPlanCopy, dayStrip } from "./day-nav.ts";
import type { PlanTask, StudyPlan } from "./types.ts";

const TODAY = "2026-10-28";

function task(over: Partial<PlanTask>): PlanTask {
  return {
    id: over.id ?? "t",
    date: TODAY,
    orderIdx: 0,
    type: "lesson",
    lessonId: null,
    courseId: null,
    title: "x",
    teacher: "",
    durationMin: 30,
    status: "pending",
    completedAt: null,
    rescheduledCount: 0,
    notesUrl: null,
    dppUrl: null,
    minutesLogged: 0,
    updatedAt: "",
    deletedAt: null,
    pinned: false,
    refLessonIds: [],
    note: "",
    ...over,
  };
}

describe("day nav", () => {
  it("labels days relative to today", () => {
    assert.equal(dayNavLabel(TODAY, TODAY).relative, "Today");
    assert.equal(dayNavLabel("2026-10-29", TODAY).relative, "Tomorrow");
    assert.equal(dayNavLabel("2026-10-27", TODAY).relative, "Yesterday");
    assert.equal(dayNavLabel("2026-11-02", TODAY).relative, "In 5 days");
    assert.equal(dayNavLabel("2026-10-20", TODAY).relative, "8 days ago");
    assert.match(dayNavLabel(TODAY, TODAY).title, /Wednesday 28 October/);
  });

  it("parses ?day= and refuses silly values", () => {
    assert.equal(dayFromSearch("2026-10-30", TODAY), "2026-10-30");
    assert.equal(dayFromSearch("nope", TODAY), TODAY);
    assert.equal(dayFromSearch("2030-01-01", TODAY), TODAY, "too far ahead");
    assert.equal(dayFromSearch(undefined, TODAY), TODAY);
  });

  it("stops forward paging at the horizon and back paging at the plan start", () => {
    const plan = { startDate: "2026-10-01", endDate: "2027-03-01" };
    assert.equal(canStepDay(TODAY, TODAY, 1), true);
    assert.equal(canStepDay(`2026-12-27`, TODAY, 1), false, `${DAY_NAV_MAX_AHEAD} days ahead is the edge`);
    assert.equal(canStepDay("2026-10-02", TODAY, -1, plan), true);
    assert.equal(canStepDay("2026-10-01", TODAY, -1, plan), false);
  });

  it("builds a seven-day strip with tallies and rest days around the current day", () => {
    const plan = {
      id: "p",
      prefs: { holidays: ["2026-10-31"] },
      tasks: [task({ id: "a", date: "2026-10-29" }), task({ id: "b", date: "2026-10-29", status: "done" }), task({ id: "c", date: "2026-10-26", status: "done" })],
    } as unknown as StudyPlan;
    const strip = dayStrip(plan, TODAY, TODAY);
    assert.equal(strip.length, 7);
    assert.equal(strip[0]!.key, "2026-10-25");
    assert.equal(strip[3]!.isToday, true);
    assert.equal(strip[3]!.isCurrent, true);
    assert.deepEqual([strip[4]!.total, strip[4]!.done], [2, 1]);
    assert.equal(strip[6]!.rest, true);
    assert.equal(strip[1]!.done, 1);
  });

  it("writes a headline that fits the day's tense", () => {
    assert.equal(dayPlanCopy([], "2026-10-30", TODAY), "Nothing planned yet");
    assert.equal(dayPlanCopy([], "2026-10-20", TODAY), "Nothing was planned");
    assert.equal(dayPlanCopy([task({}), task({ durationMin: 45 })], "2026-10-30", TODAY), "2 planned · 75 min");
    assert.equal(dayPlanCopy([task({ status: "done" }), task({})], "2026-10-20", TODAY), "1 of 2 done");
    assert.equal(dayPlanCopy([task({ status: "done" })], "2026-10-20", TODAY), "All 1 done");
    assert.equal(dayPlanCopy([task({})], TODAY, TODAY), "1 left · 30 min");
  });
});
