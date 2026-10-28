import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fc from "fast-check";
import { isHttpsCdn, isSlideUrl, sanitizeFilename } from "../cdn-proxy.ts";
import { mergeTasks } from "./merge.ts";
import type { PlanTask } from "./types.ts";

const taskArb: fc.Arbitrary<PlanTask> = fc.record({
  id: fc.stringMatching(/^[a-z0-9]{1,8}$/),
  date: fc.constant("2026-10-08"),
  orderIdx: fc.integer({ min: 0, max: 40 }),
  type: fc.constant("custom"),
  lessonId: fc.constant(null),
  courseId: fc.constant(null),
  title: fc.string({ maxLength: 24 }),
  teacher: fc.constant(""),
  durationMin: fc.integer({ min: 0, max: 180 }),
  status: fc.constant("pending"),
  completedAt: fc.constant(null),
  rescheduledCount: fc.constant(0),
  notesUrl: fc.constant(null),
  dppUrl: fc.constant(null),
  minutesLogged: fc.constant(0),
  updatedAt: fc.integer({ min: 1_600_000_000, max: 1_900_000_000 }).map((sec) => new Date(sec * 1000).toISOString()),
  deletedAt: fc.constant(null),
  pinned: fc.constant(false),
  refLessonIds: fc.constant([]),
  note: fc.constant(""),
});

describe("mergeTasks properties", () => {
  it("is idempotent once duplicates are resolved", () => {
    fc.assert(
      fc.property(fc.array(taskArb, { maxLength: 12 }), (tasks) => {
        const once = mergeTasks(tasks, tasks);
        assert.deepEqual(mergeTasks(once, once), once);
      }),
    );
  });

  it("keeps the later edit no matter which side it is on", () => {
    fc.assert(
      fc.property(taskArb, fc.string({ maxLength: 12 }), (base, title) => {
        const older: PlanTask = { ...base, updatedAt: "2020-01-01T00:00:00.000Z", title: "old" };
        const newer: PlanTask = { ...base, updatedAt: "2024-06-01T00:00:00.000Z", title };
        assert.equal(mergeTasks([older], [newer])[0]?.title, title);
        assert.equal(mergeTasks([newer], [older])[0]?.title, title);
      }),
    );
  });

  it("returns one row per id, sorted by order then id", () => {
    fc.assert(
      fc.property(fc.array(taskArb, { maxLength: 12 }), fc.array(taskArb, { maxLength: 12 }), (a, b) => {
        const merged = mergeTasks(a, b);
        const ids = merged.map((task) => task.id);
        assert.equal(new Set(ids).size, ids.length);
        const sorted = [...merged].sort((x, y) => x.orderIdx - y.orderIdx || x.id.localeCompare(y.id));
        assert.deepEqual(merged, sorted);
      }),
    );
  });
});

describe("cdn address properties", () => {
  it("rejects non-https and off-allowlist hosts", () => {
    fc.assert(
      fc.property(fc.domain(), fc.constantFrom("http:", "https:"), (host, protocol) => {
        const url = new URL(`${protocol}//${host}/a.jpg`);
        if (protocol !== "https:" || !(host === "uacdn.net" || host.endsWith(".uacdn.net"))) {
          assert.equal(isHttpsCdn(url), false);
          assert.equal(isSlideUrl(url), false);
        }
      }),
    );
  });

  it("accepts https hosts under uacdn.net", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,12}$/), (label) => {
        const url = new URL(`https://${label}.uacdn.net/slide.jpg`);
        assert.equal(isHttpsCdn(url), true);
        assert.equal(isSlideUrl(url), true);
      }),
    );
  });

  it("filename sanitizer never returns a path or a quote", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (name) => {
        const safe = sanitizeFilename(name);
        assert.equal(safe.includes("/"), false);
        assert.equal(safe.includes("\\"), false);
        assert.equal(safe.includes('"'), false);
        assert.match(safe, /\.pdf$/i);
      }),
    );
  });
});
