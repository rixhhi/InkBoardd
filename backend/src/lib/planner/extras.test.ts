import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeBadges, mergeById, mergeJournal, mergeSessions } from "@inkboard/shared/planner/extras";

describe("extras merge", () => {
  it("keeps the newer row and honours deletions over older edits", () => {
    const a = { id: "1", updatedAt: "2026-03-02T00:00:00.000Z", deletedAt: null as string | null };
    const b = { id: "1", updatedAt: "2026-03-03T00:00:00.000Z", deletedAt: "2026-03-03T00:00:00.000Z" as string | null };
    assert.equal(mergeById([a], [b])[0]!.deletedAt, "2026-03-03T00:00:00.000Z");
    const revived = { id: "1", updatedAt: "2026-03-02T12:00:00.000Z", deletedAt: null };
    assert.equal(mergeById([b], [revived])[0]!.deletedAt, "2026-03-03T00:00:00.000Z");
  });

  it("merges sessions, journal (by date) and badges", () => {
    const sessions = mergeSessions(
      [{ id: "s1", updatedAt: "2026-03-01T00:00:00.000Z", startIso: "2026-03-01T10:00:00.000Z" } as never],
      [{ id: "s1", updatedAt: "2026-03-02T00:00:00.000Z", startIso: "2026-03-02T10:00:00.000Z" } as never],
    );
    assert.equal(sessions[0]!.updatedAt, "2026-03-02T00:00:00.000Z");
    const journal = mergeJournal(
      [{ date: "2026-03-01", updatedAt: "2026-03-01T00:00:00.000Z", summary: "old" } as never],
      [{ date: "2026-03-01", updatedAt: "2026-03-02T00:00:00.000Z", summary: "new" } as never],
    );
    assert.equal((journal[0] as { summary: string }).summary, "new");
    const badges = mergeBadges(
      [{ id: "first-lecture", updatedAt: "2026-03-01T00:00:00.000Z" } as never],
      [{ id: "first-lecture", updatedAt: "2026-03-03T00:00:00.000Z" } as never],
    );
    assert.equal(badges[0]!.updatedAt, "2026-03-03T00:00:00.000Z");
  });
});
