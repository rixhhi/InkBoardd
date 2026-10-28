import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_PROFILE, readProfile, writeProfile } from "@inkboard/shared/planner/profile";

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

describe("planner profile", () => {
  it("defaults then round-trips name and streak mode", () => {
    mockStorage();
    assert.equal(readProfile().streakMode, DEFAULT_PROFILE.streakMode);
    writeProfile({ name: "Asha", streakMode: "goal", weeklyMinutes: 600 });
    const p = readProfile();
    assert.equal(p.name, "Asha");
    assert.equal(p.streakMode, "goal");
    assert.equal(p.weeklyMinutes, 600);
  });
});
