import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deltaLabel, nudgeFor, type DigestRow } from "../../components/admin/week-digest.tsx";

const member = { id: 1, name: "Riya", email: "r@x", role: "member", status: "active" } as unknown as DigestRow["member"];
const row = (over: Partial<DigestRow>): DigestRow => ({ member, minutes: 0, minutesPrev: 0, activeDays: 0, lessons: 0, streak: 0, lastActivityAt: null, ink: null, ...over });

describe("week digest", () => {
  it("delta label: new, same, up, down, nothing", () => {
    assert.deepEqual(deltaLabel(0, 0), { text: "—", tone: "neutral" });
    assert.deepEqual(deltaLabel(40, 0), { text: "new", tone: "ok" });
    assert.deepEqual(deltaLabel(102, 100), { text: "same", tone: "neutral" });
    assert.deepEqual(deltaLabel(150, 100), { text: "+50%", tone: "ok" });
    assert.deepEqual(deltaLabel(50, 100), { text: "−50%", tone: "warn" });
  });

  it("nudges: quiet after busy beats plain quiet; ghosts need a real sample; streak is good news", () => {
    assert.match(nudgeFor(row({ minutesPrev: 120 }))!, /after a busy one/);
    assert.match(nudgeFor(row({}))!, /not opened/);
    assert.equal(nudgeFor(row({ activeDays: 3, minutes: 30, ink: { crisp: 1, fading: 1, ghost: 2, total: 4 } })), null, "fewer than 5 studied lessons: no ghost warning");
    assert.match(nudgeFor(row({ activeDays: 3, minutes: 30, ink: { crisp: 2, fading: 1, ghost: 4, total: 7 } }))!, /4 of 7 .* ghosts/);
    assert.match(nudgeFor(row({ activeDays: 3, minutes: 30, minutesPrev: 100 }))!, /Half of last week/);
    assert.match(nudgeFor(row({ activeDays: 7, minutes: 300, minutesPrev: 280, streak: 9 }))!, /9-day streak/);
    assert.equal(nudgeFor(row({ activeDays: 4, minutes: 100, minutesPrev: 90 })), null);
  });
});
