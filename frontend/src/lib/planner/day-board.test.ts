import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  chalkDust,
  dayRemainCopy,
  EMPTY_BOARD,
  FIRST_SITTING,
  historyDayLine,
  openBoardSession,
  slotCaption,
  studiedMinutesForDay,
} from "@inkboard/shared/planner/day-board";
import type { PlanTask } from "@inkboard/shared/planner/types";

function task(partial: Partial<PlanTask>): PlanTask {
  return {
    id: "t1",
    date: "2026-09-30",
    orderIdx: 0,
    type: "lesson",
    lessonId: "les-1",
    courseId: "c1",
    title: "Gauss",
    teacher: "Om",
    durationMin: 42,
    status: "pending",
    completedAt: null,
    rescheduledCount: 0,
    notesUrl: null,
    dppUrl: null,
    minutesLogged: 0,
    updatedAt: "2026-09-30T00:00:00.000Z",
    deletedAt: null,
    pinned: false,
    refLessonIds: [],
    note: "",
    ...partial,
  };
}

describe("day board", () => {
  it("writes remaining as a ledger line, not a ring", () => {
    assert.equal(dayRemainCopy(3, 80), "3 left · 1h 20m");
    assert.equal(dayRemainCopy(1, 20), "1 left · 20m");
    assert.equal(dayRemainCopy(0, 0), "Board clear");
    assert.equal(slotCaption("evening"), "evening");
    assert.equal(EMPTY_BOARD.title, "No classes on this list.");
    assert.equal(EMPTY_BOARD.action, "New plan");
    assert.equal(FIRST_SITTING.write, "Find a class from the catalog");
    assert.equal(FIRST_SITTING.plan, "New plan");
    assert.equal(FIRST_SITTING.clock, "18:00");
  });

  it("fills a miniature board from minutes studied, not a green heatmap", () => {
    assert.equal(chalkDust(0, 90), 0);
    assert.equal(chalkDust(45, 90), 0.5);
    assert.equal(chalkDust(180, 90), 1);
    assert.equal(
      studiedMinutesForDay(
        "2026-09-30",
        [{ date: "2026-09-30", durationMin: 40, deletedAt: null }],
        [{ date: "2026-09-30", status: "done", durationMin: 90 }],
      ),
      40,
    );
    assert.equal(
      studiedMinutesForDay("2026-09-30", [], [{ date: "2026-09-30", status: "done", durationMin: 42 }]),
      42,
    );
    assert.equal(historyDayLine("Mon 28", 130, 4), "Mon 28 · 2h 10m · 4 struck");
  });

  it("opens the first playable pending class as a board session", () => {
    const run = openBoardSession("p1", [task({ id: "a", lessonId: null }), task({ id: "b", lessonId: "les-9", title: "GOC" })]);
    assert.equal(run?.lessonId, "les-9");
    assert.equal(run?.title, "GOC");
    assert.equal(run?.count, 1);
    assert.equal(openBoardSession("p1", [task({ lessonId: null })]), null);
  });

  it("Today is a Day Board: date as the title, strike to complete, no greeting ring", () => {
    const src = readFileSync(new URL("../../components/planner/today-page.tsx", import.meta.url), "utf8");
    const onboard = readFileSync(new URL("../../components/planner/onboarding.tsx", import.meta.url), "utf8");
    const ledger = readFileSync(new URL("../../components/folio/ledger.tsx", import.meta.url), "utf8");
    assert.match(src, /formatDay\(date, "EEEE d MMMM"\)/);
    assert.match(src, /dayRemainCopy/);
    assert.match(src, /Write a task/);
    assert.doesNotMatch(src, /Start the board/);
    assert.doesNotMatch(src, /openBoardSession/);
    assert.match(onboard, /FIRST_SITTING/);
    assert.match(onboard, /openCommandPalette/);
    assert.match(onboard, /COPY.writeAClassFromWall/);
    assert.match(onboard, /COPY.layOutAPlan/);
    assert.doesNotMatch(onboard, /PLAN_TEMPLATES/);
    assert.doesNotMatch(onboard, /Skip for now/);
    assert.doesNotMatch(onboard, /These rows lay out a pace/);
    assert.match(ledger, /Start the board/);
    assert.match(ledger, /coach\.reason/);
    assert.doesNotMatch(src, /CoachCard/);
    assert.doesNotMatch(src, /RevisionHealthPanel/);
  });

  it("Calendar draws mini boards with chalk dust and has no journal", () => {
    const src = readFileSync(new URL("../../components/planner/calendar-page.tsx", import.meta.url), "utf8");
    assert.match(src, /mini-board/);
    assert.match(src, /chalkDust/);
    assert.doesNotMatch(src, /journal/i, "journal is retired");
  });
});
