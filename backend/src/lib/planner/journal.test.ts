import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { addJournalGoal, emptyEntry, journalStreak, resetJournal, toggleJournalGoal, upsertJournal } from "@inkboard/shared/planner/journal";

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
  resetJournal();
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("journal", () => {
  it("upserts a day and tracks a writing streak", () => {
    mockStorage();
    upsertJournal({ ...emptyEntry("2026-03-02"), summary: "day 1" });
    upsertJournal({ ...emptyEntry("2026-03-03"), wentWell: "optics" });
    upsertJournal({ ...emptyEntry("2026-03-04"), summary: "day 3" });
    assert.equal(journalStreak(undefined, "2026-03-04"), 3);
  });

  it("toggles checklist goals", () => {
    mockStorage();
    const withGoal = addJournalGoal("2026-03-04", "Revise TOC");
    assert.equal(withGoal.goals[0]!.done, false);
    const toggled = toggleJournalGoal("2026-03-04", withGoal.goals[0]!.id);
    assert.equal(toggled?.goals[0]!.done, true);
  });
});
