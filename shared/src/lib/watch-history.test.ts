import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { peekProgress, readHistory, saveProgress } from "./watch-history.ts";

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
  Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true });
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("watch history", () => {
  it("ignores tiny watches and completed videos", () => {
    mockStorage();
    saveProgress({ lessonId: "2O24MEDDGPTI2AZ00YMV", title: "A", t: 3, duration: 600 });
    assert.equal(readHistory().length, 0);
    saveProgress({ lessonId: "2O24MEDDGPTI2AZ00YMV", title: "A", t: 595, duration: 600 });
    assert.equal(readHistory().length, 0);
  });

  it("saves resume position and latest-first order", () => {
    mockStorage();
    saveProgress({ lessonId: "AAAAAAAAAAAAAAA1", title: "One", t: 40, duration: 600 });
    saveProgress({ lessonId: "AAAAAAAAAAAAAAA2", title: "Two", t: 80, duration: 900 });
    const hist = readHistory();
    assert.equal(hist.length, 2);
    assert.equal(hist[0]!.lessonId, "AAAAAAAAAAAAAAA2");
    assert.equal(peekProgress("AAAAAAAAAAAAAAA1"), 40);
  });
});
