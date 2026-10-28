import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveSessions, sessionsOverlap, validateManualLog } from "@inkboard/shared/planner/sessions";

describe("manual study log", () => {
  it("rejects future and overlapping sessions", () => {
    const now = new Date("2026-03-04T12:00:00Z");
    const future = validateManualLog({ startIso: "2026-03-04T13:00:00.000Z", durationMin: 30 }, [], now);
    assert.equal(future.ok, false);
    const existing = [
      {
        id: "s1",
        date: "2026-03-04",
        startIso: "2026-03-04T10:00:00.000Z",
        durationMin: 60,
        subject: "",
        courseId: null,
        taskId: null,
        lessonId: null,
        notes: "",
        source: "manual" as const,
        completed: true,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ];
    const overlap = validateManualLog({ startIso: "2026-03-04T10:30:00.000Z", durationMin: 20 }, existing, now);
    assert.equal(overlap.ok, false);
    const ok = validateManualLog({ startIso: "2026-03-04T08:00:00.000Z", durationMin: 20 }, existing, now);
    assert.equal(ok.ok, true);
  });

  it("detects overlap windows", () => {
    assert.equal(sessionsOverlap("2026-03-04T10:00:00.000Z", 30, "2026-03-04T10:20:00.000Z", 10), true);
    assert.equal(sessionsOverlap("2026-03-04T10:00:00.000Z", 30, "2026-03-04T10:30:00.000Z", 10), false);
  });

  it("liveSessions returns a stable snapshot", () => {
    assert.equal(liveSessions(), liveSessions());
  });
});
