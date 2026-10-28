import assert from "node:assert/strict";
import test from "node:test";
import { breakerOpen, upstreamBad, upstreamNotFound, upstreamTimeout, UpstreamError } from "@inkboard/shared/http-error";
import { clearUpstreamFail, readUpstreamFail, reportUpstreamFail } from "@inkboard/shared/upstream";
import { createBreaker, familyBreaker, resetBreakers } from "./breaker.ts";
import { publicError } from "../http.ts";
import { swr, swrInvalidate, swrPeek, swrReset } from "./swr-cache.ts";
import { mergePlusPages } from "../integrations/unacademy/support.ts";
import { shareJob, timelineFresh } from "../services/lesson-media.ts";
import type { ExamCourse } from "../integrations/unacademy/types.ts";

function course(uid: string): ExamCourse {
  return {
    uid, name: uid, slug: uid, topic: "", lessonCount: 1,
    authorName: "", authorUsername: "", authorAvatar: "", thumbnail: "",
    liveAt: null, classUid: null, classSlug: null, replayId: null, status: "replay",
  };
}

test("family breakers stay separate and ignore 404s", async () => {
  resetBreakers();
  const api = familyBreaker("unacademy-api");
  const cdn = familyBreaker("cdn");
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => api.run(() => Promise.reject(upstreamNotFound())), (err: unknown) => err instanceof Error);
  }
  assert.equal(api.failures(), 0);
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => cdn.run(() => Promise.reject(upstreamTimeout())), (err: unknown) => err instanceof Error);
  }
  assert.equal(cdn.open(), true);
  await api.run(async () => "catalog");
  await assert.rejects(() => cdn.run(async () => "nope"), (err: unknown) => (err as { code?: string }).code === "UPSTREAM_BREAKER_OPEN");
  resetBreakers();
});

test("an open breaker serves a stale swr value and a cache hit does not reset failures", async () => {
  swrReset();
  resetBreakers();
  const api = familyBreaker("unacademy-api");
  await swr("hub", 1, async () => ({ teachers: ["a"] }), 60_000);
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => api.run(() => Promise.reject(upstreamTimeout())));
  }
  const fails = api.failures();
  const value = await swr("hub", 1, async () => {
    throw breakerOpen("closed", 30);
  }, 60_000);
  assert.deepEqual(value, { teachers: ["a"] });
  assert.equal(api.failures(), fails);
  await swr("hub", 60_000, async () => ({ teachers: ["a"] }));
  assert.equal(api.failures(), fails);
  resetBreakers();
  swrReset();
});

test("swrInvalidate drops an in-flight result", async () => {
  swrReset();
  let release: (value: { teachers: string[] }) => void = () => {};
  const pending = swr("late", 1_000, () => new Promise((resolve) => { release = resolve; }));
  swrInvalidate("late");
  release({ teachers: ["stale"] });
  await pending;
  assert.equal(swrPeek("late"), undefined);
  swrReset();
});

test("plus pages with different totals do not skip or duplicate rows", () => {
  const a = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => course(`a${n}`));
  const b = [0, 1, 2].map((n) => course(`b${n}`));
  const page = (rows: ExamCourse[], offset: number, size: number) => ({
    courses: rows.slice(offset, offset + size),
    total: rows.length,
    nextOffset: offset + size < rows.length ? offset + size : null,
  });
  const seen = new Set<string>();
  let offset = 0;
  for (let i = 0; i < 6 && offset != null; i += 1) {
    const merged = mergePlusPages([page(a, offset, 3), page(b, offset, 3)], offset, 3);
    for (const row of merged.courses) {
      assert.equal(seen.has(row.uid), false, row.uid);
      seen.add(row.uid);
    }
    if (merged.nextOffset == null) break;
    offset = merged.nextOffset;
  }
  assert.equal(seen.size, a.length + b.length);
});

test("an unknown notes stamp still trusts the cached timeline", () => {
  assert.equal(timelineFresh("abc", "nov"), true);
  assert.equal(timelineFresh("abc", "abc"), true);
  assert.equal(timelineFresh("abc", "def"), false);
});

test("concurrent timeline jobs share one download", async () => {
  const map = new Map<string, Promise<number>>();
  let calls = 0;
  const run = () => {
    calls += 1;
    return Promise.resolve(calls);
  };
  const [a, b] = await Promise.all([shareJob(map, "lesson", run), shareJob(map, "lesson", run)]);
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(calls, 1);
});

test("half-open lets one probe through after the cool-down", async () => {
  let t = 0;
  const breaker = createBreaker({ failures: 2, resetMs: 100, now: () => t });
  await assert.rejects(() => breaker.run(() => Promise.reject(upstreamTimeout())));
  await assert.rejects(() => breaker.run(() => Promise.reject(upstreamTimeout())));
  assert.equal(breaker.open(), true);
  t = 100;
  let probes = 0;
  const first = breaker.run(async () => {
    probes += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "ok";
  });
  await assert.rejects(
    () => breaker.run(async () => "second"),
    (err: unknown) => (err as { code?: string }).code === "UPSTREAM_BREAKER_OPEN",
  );
  assert.equal(await first, "ok");
  assert.equal(probes, 1);
  assert.equal(breaker.failures(), 0);
});

test("publicError keeps typed upstream statuses", () => {
  const rows: Array<[unknown, number, string]> = [
    [upstreamNotFound("Unacademy request failed (404)"), 404, "NOT_FOUND"],
    [upstreamTimeout(), 504, "UPSTREAM_TIMEOUT"],
    [upstreamBad(503, "Unacademy request failed (503)"), 502, "UPSTREAM"],
    [new Error("Unacademy request failed (404)"), 404, "NOT_FOUND"],
    [new Error("Unacademy request failed (503)"), 502, "UPSTREAM"],
    [new Error("Couldn't load these notes"), 502, "UPSTREAM"],
    [new Error("kaboom"), 500, "INTERNAL"],
  ];
  for (const [err, status, code] of rows) {
    const mapped = publicError(err);
    assert.equal(mapped.status, status, code);
    assert.equal(mapped.code, code);
  }
  assert.ok(upstreamTimeout() instanceof UpstreamError);
});

test("a memory cache hit does not clear an upstream outage", async () => {
  swrReset();
  clearUpstreamFail();
  await swr("kept", 60_000, async () => ({ ok: true }));
  reportUpstreamFail("/api/exams", upstreamTimeout(), 100_000);
  await swr("kept", 60_000, async () => {
    throw new Error("should not run");
  });
  assert.equal(readUpstreamFail(130_000)?.status, 504);
  clearUpstreamFail();
  swrReset();
});

test("an expired entry is still served when the breaker is open", async () => {
  swrReset();
  await swr("old", 1, async () => ({ teachers: ["a"] }), 1);
  await new Promise((resolve) => setTimeout(resolve, 15));
  const value = await swr("old", 1, async () => {
    throw breakerOpen("closed", 30);
  }, 1);
  assert.deepEqual(value, { teachers: ["a"] });
  assert.deepEqual(swrPeek("old"), { teachers: ["a"] });
  swrReset();
});
