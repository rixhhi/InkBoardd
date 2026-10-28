import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { courseHasContent, hubHasContent, rememberHub, readHub, hubCacheKey } from "@inkboard/shared/catalog-cache";
import { localGet } from "@inkboard/shared/local-cache";

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

describe("catalog cache", () => {
  it("does not persist an empty hub scrape", () => {
    mockStorage();
    assert.equal(hubHasContent({ teachers: [], courses: [], playlists: [] }), false);
    assert.equal(rememberHub("NVLIA", { teachers: [], courses: [], playlists: [] }), false);
    assert.equal(readHub("NVLIA"), undefined);
    assert.equal(localGet(hubCacheKey("NVLIA")), undefined);
  });

  it("persists a hub that has courses", () => {
    mockStorage();
    assert.equal(rememberHub("NVLIA", { teachers: [], courses: [{ uid: "COURSE1" }], playlists: [] }), true);
    assert.equal(readHub<{ courses: { uid: string }[] }>("NVLIA")?.data.courses[0]?.uid, "COURSE1");
  });

  it("treats a live-only hub as content and requires a course uid", () => {
    assert.equal(hubHasContent({ live: [{ classUid: "A" }] }), true);
    assert.equal(courseHasContent({ course: { uid: "C1" }, lessons: [] }), false);
    assert.equal(courseHasContent({ course: { uid: "C1" }, lessons: [], total: 0 }), true);
    assert.equal(courseHasContent({ lessons: [1] }), false);
    assert.equal(courseHasContent(null), false);
  });
});
