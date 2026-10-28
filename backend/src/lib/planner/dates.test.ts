import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  addDaysKey,
  addMonthsKey,
  addWeeksKey,
  calendarDate,
  keyOf,
  parseKey,
  setPlannerNow,
  todayKey,
  msUntilNextLocalMidnight,
  weekId,
  weekKeys,
} from "@inkboard/shared/planner/dates";

afterEach(() => setPlannerNow(null));

describe("planner dates", () => {
  it("round-trips yyyy-MM-dd as a local calendar date", () => {
    assert.equal(keyOf(parseKey("2026-03-08")), "2026-03-08");
    assert.equal(addDaysKey("2026-03-08", 1), "2026-03-09");
    assert.equal(addDaysKey("2026-03-01", -1), "2026-02-28");
  });

  it("weekKeys starts on Monday", () => {
    const keys = weekKeys("2026-03-04");
    assert.equal(keys[0], "2026-03-02");
    assert.equal(keys[6], "2026-03-08");
  });

  it("ISO week id is stable across a week", () => {
    assert.equal(weekId("2026-03-02"), "2026-W10");
    assert.equal(weekId("2026-03-08"), "2026-W10");
    assert.equal(weekId("2026-03-09"), "2026-W11");
  });

  it("todayKey matches the local calendar, not UTC", () => {
    const now = new Date(2026, 2, 8, 1, 0, 0);
    assert.equal(todayKey(now), "2026-03-08");
  });

  it("stays on the local day around midnight (IST vs UTC)", () => {
    const late = new Date(2026, 2, 8, 0, 15, 0);
    assert.equal(todayKey(late), "2026-03-08");
    const utc = new Date(Date.UTC(2026, 2, 7, 18, 45, 0));
    assert.equal(keyOf(utc), todayKey(utc));
    assert.match(todayKey(utc), /^\d{4}-\d{2}-\d{2}$/);
  });

  it("arms a midnight timer on the local calendar", () => {
    const justBefore = new Date(2026, 2, 8, 23, 59, 50);
    const wait = msUntilNextLocalMidnight(justBefore);
    assert.ok(wait >= 10_000 && wait <= 12_000);
    const noon = new Date(2026, 2, 8, 12, 0, 0);
    assert.ok(msUntilNextLocalMidnight(noon) > 12 * 3600_000);
  });


  it("addMonths uses date-fns across Jan 31 / Mar 31 / year boundaries", () => {
    assert.equal(addMonthsKey("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonthsKey("2026-03-31", 1), "2026-04-30");
    assert.equal(addMonthsKey("2026-12-31", 1), "2027-01-31");
    assert.equal(addMonthsKey("2026-01-31", -1), "2025-12-31");
  });

  it("addWeeks crosses year boundaries", () => {
    assert.equal(addWeeksKey("2026-12-28", 1), "2027-01-04");
    assert.equal(addWeeksKey("2026-01-04", -1), "2025-12-28");
  });

  it("midnight IST vs UTC stays on the local calendar day", () => {
    setPlannerNow(new Date(2026, 2, 8, 0, 15, 0));
    assert.equal(todayKey(), "2026-03-08");
    setPlannerNow(new Date(2026, 2, 8, 23, 45, 0));
    assert.equal(todayKey(), "2026-03-08");
  });

  it("does not shift IST local midnight to the previous UTC day", () => {
    const istMidnight = new Date(2026, 2, 8, 0, 0, 0);
    assert.equal(calendarDate(istMidnight), "2026-03-08");
    const utcMidnight = new Date(Date.UTC(2026, 2, 8, 0, 0, 0));
    assert.equal(calendarDate(utcMidnight), "2026-03-08");
    assert.equal(calendarDate("2026-03-08"), "2026-03-08");
    assert.equal(calendarDate("2026-03-08T00:00:00.000Z"), "2026-03-08");
  });
});
