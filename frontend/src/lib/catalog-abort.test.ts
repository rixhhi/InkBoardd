import assert from "node:assert/strict";
import test from "node:test";
import { apiJson, shouldRetry } from "./api-client.ts";
import { catalogState, resetCatalogStatus, setCatalogStatus } from "./catalog-status.ts";
import { drainCoursePages } from "./course-rest.ts";
import { appendMore, blankMore, failMore, visibleNext } from "./exam-more.ts";
import { loadExamHub } from "./unacademy.ts";
import { resetPrefetch, schedulePrefetch } from "./prefetch.ts";

test("a caller abort is not a catalog failure", async () => {
  const g = globalThis as { window?: object; fetch?: typeof fetch };
  const prevWindow = g.window;
  const prevFetch = g.fetch;
  g.window = {};
  resetCatalogStatus();
  setCatalogStatus("ok");
  const ac = new AbortController();
  g.fetch = (() => {
    ac.abort();
    return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  }) as typeof fetch;
  await assert.rejects(() => apiJson("/api/exams", { signal: ac.signal }), (err: unknown) => {
    assert.equal(err instanceof Error && err.name, "AbortError");
    assert.equal(err instanceof Error && "status" in err, false);
    return true;
  });
  assert.equal(catalogState().status, "ok");
  assert.equal(shouldRetry(0, new DOMException("The operation was aborted.", "AbortError")), false);
  g.fetch = prevFetch;
  g.window = prevWindow;
});

test("the course pager resumes after a failed page and stops on an empty page", async () => {
  const seen = new Set(["a"]);
  const calls: number[] = [];
  let fail = true;
  const load = async (offset: number) => {
    calls.push(offset);
    if (offset === 2 && fail) throw new Error("down");
    if (offset === 6) return { lessons: [], nextOffset: 8 };
    return { lessons: [{ uid: `u${offset}` }], nextOffset: offset + 2 };
  };
  const first = await drainCoursePages({ start: 2, seen, signal: new AbortController().signal, load });
  assert.equal(first.status, "error");
  assert.equal(first.failedOffset, 2);
  assert.deepEqual(first.acc, []);
  fail = false;
  const second = await drainCoursePages({
    start: first.failedOffset!,
    seen,
    signal: new AbortController().signal,
    initial: first.acc,
    load,
  });
  assert.equal(second.status, "done");
  assert.deepEqual(second.acc.map((row) => row.uid), ["u2", "u4"]);
  assert.deepEqual(calls, [2, 2, 4, 6]);
});

test("load-more keeps earlier pages and a failed page stays retryable", () => {
  const hubNext = 12;
  let more = blankMore<{ uid: string }>();
  assert.equal(visibleNext(hubNext, more), 12);
  more = appendMore(more, [{ uid: "t" }], 24);
  assert.equal(visibleNext(hubNext, more), 24);
  more = failMore(more, "down");
  assert.equal(more.items.length, 1);
  assert.equal(more.next, 24);
  assert.equal(visibleNext(hubNext, more), 24);
});

test("an already-aborted loader does not mark the catalog down", async () => {
  resetCatalogStatus();
  setCatalogStatus("ok");
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(() => loadExamHub({ data: { goalId: "NVLIA" }, signal: ac.signal }), (err: unknown) => {
    assert.equal(err instanceof Error && err.name, "AbortError");
    return true;
  });
  assert.equal(catalogState().status, "ok");
});

test("prefetch waits, stays at two at a time, and skips a down catalog", async () => {
  resetPrefetch();
  resetCatalogStatus();
  setCatalogStatus("ok");
  let started = 0;
  const gates: Array<() => void> = [];
  const run = () =>
    new Promise<void>((resolve) => {
      started += 1;
      gates.push(resolve);
    });
  schedulePrefetch(run);
  schedulePrefetch(run);
  schedulePrefetch(run);
  assert.equal(started, 0);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(started, 2);
  gates[0]?.();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(started, 3);
  gates[1]?.();
  gates[2]?.();
  setCatalogStatus("down");
  const before = started;
  schedulePrefetch(run);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(started, before);
  resetPrefetch();
  resetCatalogStatus();
});
