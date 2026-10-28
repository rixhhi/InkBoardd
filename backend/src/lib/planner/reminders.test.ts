import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inQuietHours, reminderHourOf, scheduleInAppBanner } from "@inkboard/shared/planner/reminders";
import { fillPrefs, fillTask } from "@inkboard/shared/planner/types";

describe("reminders", () => {
  it("quiet hours wrap midnight", () => {
    assert.equal(inQuietHours(23, 22, 7), true);
    assert.equal(inQuietHours(3, 22, 7), true);
    assert.equal(inQuietHours(10, 22, 7), false);
    assert.equal(inQuietHours(12, 12, 12), false);
    assert.equal(inQuietHours(14, 13, 17), true);
  });

  it("banner stays off during quiet hours", () => {
    const prefs = fillPrefs({ reminders: true, quietStart: 22, quietEnd: 7, timeSlot: "evening" });
    const tasks = [fillTask({ id: "t", title: "Optics", date: "2026-03-08" })];
    const night = new Date(2026, 2, 8, 23, 0, 0);
    assert.equal(scheduleInAppBanner(prefs, tasks, night), null);
    const afternoon = new Date(2026, 2, 8, 16, 0, 0);
    assert.match(scheduleInAppBanner(prefs, tasks, afternoon) ?? "", /1 class/);
  });

  it("uses reminderHour when set", () => {
    const prefs = fillPrefs({ reminderHour: 8, timeSlot: "evening" });
    assert.equal(reminderHourOf(prefs), 8);
  });
});
