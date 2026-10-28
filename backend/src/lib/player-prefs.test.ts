import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readPlayerPrefs, writePlayerPrefs } from "@inkboard/shared/player-prefs";

function mockStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true });
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { window?: unknown }).window;
});

describe("player prefs", () => {
  it("returns defaults without window", () => {
    const prefs = readPlayerPrefs();
    assert.equal(prefs.speed, 1);
    assert.equal(prefs.camOff, false);
    assert.equal(prefs.layout, "pip");
  });

  it("persists speed and clamps junk values", () => {
    mockStorage();
    writePlayerPrefs({ speed: 1.5, volume: 2, muted: true, camOff: true });
    const prefs = readPlayerPrefs();
    assert.equal(prefs.speed, 1.5);
    assert.equal(prefs.volume, 1);
    assert.equal(prefs.muted, true);
    assert.equal(prefs.camOff, true);
    localStorage.setItem("inkboard.player.v1", JSON.stringify({ speed: 9, layout: "nope" }));
    const again = readPlayerPrefs();
    assert.equal(again.speed, 1);
    assert.equal(again.layout, "pip");
  });
});
