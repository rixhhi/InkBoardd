import assert from "node:assert/strict";
import test from "node:test";
import { streakFrom } from "../../src/auth/store/activity.ts";

test("streak counts consecutive active days ending today", () => {
  assert.equal(streakFrom(["2026-10-29", "2026-10-28", "2026-10-27"], "2026-10-29"), 3);
});

test("a streak survives one quiet day: yesterday-ending run still counts", () => {
  assert.equal(streakFrom(["2026-10-28", "2026-10-27"], "2026-10-29"), 2);
});

test("a gap before yesterday breaks it", () => {
  assert.equal(streakFrom(["2026-10-27", "2026-10-26"], "2026-10-29"), 0);
  assert.equal(streakFrom(["2026-10-29", "2026-10-27"], "2026-10-29"), 1);
});

test("empty input and unordered input are fine", () => {
  assert.equal(streakFrom([], "2026-10-29"), 0);
  assert.equal(streakFrom(["2026-10-27", "2026-10-29", "2026-10-28"], "2026-10-29"), 3);
});
