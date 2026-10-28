import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planToIcs } from "@inkboard/shared/planner/ics";
import { fillPrefs, fillTask } from "@inkboard/shared/planner/types";
import type { StudyPlan } from "@inkboard/shared/planner/types";

const plan: StudyPlan = {
  id: "plan1",
  examId: "YOTUH",
  examName: "NEET UG",
  name: "NEET · AG",
  prefs: fillPrefs({ startDate: "2026-03-02", timeSlot: "evening" }),
  startDate: "2026-03-02",
  endDate: "2026-03-20",
  active: true,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  deletedAt: null,
  courses: [],
  tasks: [
    fillTask({ id: "t1", date: "2026-03-02", title: "Optics, commas & notes", lessonId: "LESSON1", durationMin: 40 }),
    fillTask({ id: "skip", date: "2026-03-03", title: "Skip me", status: "skipped" }),
  ],
};

describe("planToIcs", () => {
  it("emits timed events, a stable UID, DTSTAMP, and a 15-minute alarm", () => {
    const now = new Date(Date.UTC(2026, 2, 8, 6, 30, 0));
    const ics = planToIcs(plan, now);
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /DTSTAMP:20260308T063000Z/);
    assert.match(ics, /UID:t1@inkboard/);
    assert.match(ics, /DTSTART:20260302T190000/);
    assert.match(ics, /SUMMARY:Optics\\, commas & notes/);
    assert.match(ics, /TRIGGER:-PT15M/);
    assert.match(ics, /Play \/play\/LESSON1/);
    assert.doesNotMatch(ics, /Skip me/);
  });
});
