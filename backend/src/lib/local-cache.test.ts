import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { localGet, localRemove, localRemovePrefix, localSet } from "@inkboard/shared/local-cache";

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

describe("local hub cache", () => {
  it("round-trips a hub and drops it on remove", () => {
    mockStorage();
    localSet("exam-hub-v6:NVLIA", { courses: [{ uid: "C1" }] });
    assert.equal(localGet<{ courses: { uid: string }[] }>("exam-hub-v6:NVLIA")?.data.courses[0]?.uid, "C1");
    localRemove("exam-hub-v6:NVLIA");
    assert.equal(localGet("exam-hub-v6:NVLIA"), undefined);
  });

  it("removePrefix only drops matching keys", () => {
    mockStorage();
    localSet("exam-hub-v6:NVLIA", 1);
    localSet("course-v7:ABC", 2);
    localRemovePrefix("exam-hub-v6:");
    assert.equal(localGet("exam-hub-v6:NVLIA"), undefined);
    assert.equal(localGet("course-v7:ABC")?.data, 2);
  });
});
