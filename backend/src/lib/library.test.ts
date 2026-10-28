import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isLater, isSaved, readLater, readSaved, toggleLater, toggleSaved } from "@inkboard/shared/library";

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

describe("saved teachers and watch later", () => {
  it("pins and unpins a teacher", () => {
    mockStorage();
    const t = { username: "agsir", name: "AG Sir", avatar: "" };
    assert.equal(toggleSaved(t), true);
    assert.equal(isSaved("AGSIR"), true);
    assert.equal(readSaved()[0]!.username, "agsir");
    assert.equal(toggleSaved(t), false);
    assert.equal(isSaved("agsir"), false);
  });

  it("bookmarks a class for later", () => {
    mockStorage();
    const item = { lessonId: "2O24MEDDGPTI2AZ00YMV", title: "Tissues" };
    assert.equal(toggleLater(item), true);
    assert.equal(isLater(item.lessonId), true);
    assert.equal(readLater().length, 1);
    assert.equal(toggleLater(item), false);
    assert.equal(isLater(item.lessonId), false);
  });
});
