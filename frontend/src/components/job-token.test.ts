import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api-client";
import { clearLectureJob, lectureJobDeleteInit, lecturePollDelay, lectureStatusGone, rememberLectureJob, resumeLectureJob } from "./job-token.ts";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}

describe("lecture job token", () => {
  it("keeps the creator token with the job id and sends it on delete", () => {
    const store = memoryStorage();
    const previous = globalThis.sessionStorage;
    globalThis.sessionStorage = store;
    try {
      const kept = rememberLectureJob({ id: "abc123", token: "sekret" }, "lesson1");
      assert.deepEqual(kept, { id: "abc123", token: "sekret" });
      assert.deepEqual(rememberLectureJob({ id: "abc123" }), { id: "abc123", token: "" });
      assert.deepEqual(resumeLectureJob("lesson1"), { id: "abc123", token: "sekret" });
      store.clear();
      globalThis.sessionStorage = memoryStorage();
      globalThis.sessionStorage.setItem("inkboard.job-token.abc123", "sekret");
      globalThis.sessionStorage.setItem("inkboard.job-active.lesson1", "abc123");
      const restored = resumeLectureJob("lesson1");
      assert.deepEqual(restored, { id: "abc123", token: "sekret" });
      const init = lectureJobDeleteInit(restored?.token || "");
      assert.equal(init.method, "DELETE");
      assert.equal((init.headers as { "x-job-token": string })["x-job-token"], "sekret");
      clearLectureJob("lesson1");
      assert.equal(resumeLectureJob("lesson1"), null);
    } finally {
      globalThis.sessionStorage = previous;
    }

    const src = readFileSync(new URL("./save-chapter.tsx", import.meta.url), "utf8");
    assert.match(src, /rememberLectureJob\(created, lessonId\)/);
    assert.match(src, /resumeLectureJob\(lessonId\)/);
    assert.match(src, /lectureJobDeleteInit\(jobToken\)/);
    assert.match(src, /setJobToken\(kept\.token\)/);
    assert.match(src, /COPY\.stopJob/);
    assert.doesNotMatch(src, />\s*Stop\s*</);
    assert.match(src, /clearLectureJob\(lessonId\);\s*setJobState\("error"\)/);
    assert.match(src, /lectureStatusGone\(err\)/);
    assert.match(src, /lecturePollDelay\(failures\)/);
    assert.match(src, /err\.status === 403 \|\| err\.status === 404\)\) clearLectureJob\(lessonId\)/);
    assert.doesNotMatch(src, /setInterval\(\(\) => void tick\(\), 2000\)/);
  });

  it("keeps the token across a network or 5xx poll and drops it for 404 or 410", () => {
    assert.equal(lectureStatusGone(new ApiError(404, "missing")), true);
    assert.equal(lectureStatusGone(new ApiError(410, "gone")), true);
    assert.equal(lectureStatusGone(new ApiError(500, "down")), false);
    assert.equal(lectureStatusGone(new ApiError(503, "down")), false);
    assert.equal(lectureStatusGone(new TypeError("network")), false);
    assert.equal(lecturePollDelay(0), 2_000);
    assert.equal(lecturePollDelay(1), 2_000);
    assert.equal(lecturePollDelay(2), 4_000);
    assert.equal(lecturePollDelay(3), 8_000);
    assert.equal(lecturePollDelay(8), 30_000);
  });
});
