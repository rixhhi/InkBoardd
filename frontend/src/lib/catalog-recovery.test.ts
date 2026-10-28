import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { ApiError, apiJson, describeError, shouldRetry } from "./api-client.ts";
import { catalogState, resetCatalogStatus, setCatalogStatus } from "./catalog-status.ts";
import { drainCoursePages } from "./course-rest.ts";
import { resetPrefetch, schedulePrefetch } from "./prefetch.ts";

const original = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = original;
  resetCatalogStatus();
  resetPrefetch();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("catalog requests recover without a reload", () => {
  it("retries 503 HTML and then accepts 200", async () => {
    let n = 0;
    globalThis.fetch = async () => {
      n += 1;
      if (n < 4) return new Response("<html>down</html>", { status: 503, headers: { "content-type": "text/html" } });
      return json({ ok: true });
    };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: shouldRetry, retryDelay: () => 0 } },
    });
    const data = await client.fetchQuery({
      queryKey: ["round3", "retry"],
      queryFn: () => apiJson<{ ok: boolean }>("/api/exams"),
    });
    assert.equal(data.ok, true);
    assert.equal(n, 4);
    assert.equal(catalogState().status, "ok");
  });

  it("turns a fetch that never answers into TIMEOUT", async () => {
    const g = globalThis as { window?: typeof globalThis };
    g.window = globalThis;
    globalThis.fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
      });
    await assert.rejects(() => apiJson("/api/exams", {}, 40), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "TIMEOUT");
      assert.equal(describeError(err).kind, "down");
      return true;
    });
    assert.equal(catalogState().status, "down");
  });

  it("shows one offline message and clears it when the next request works", async () => {
    (globalThis as { window?: typeof globalThis }).window = globalThis;
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const err = await apiJson("/api/exams").then(
      () => null,
      (caught: unknown) => caught,
    );
    const described = describeError(err);
    assert.equal(described.kind, "network");
    assert.equal(described.title, "Can't reach the server");
    assert.equal(catalogState().status, "down");
    globalThis.fetch = async () => json({ exams: [] });
    await apiJson("/api/exams");
    assert.equal(catalogState().status, "ok");
  });

  it("keeps cached exam data when a refresh fails", async () => {
    (globalThis as { window?: typeof globalThis }).window = globalThis;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["exam", "hub"], { name: "GATE CS" });
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(() =>
      client.fetchQuery({
        queryKey: ["exam", "hub", "refresh"],
        queryFn: () => apiJson("/api/exams/NVLIA/hub"),
      }),
    );
    assert.deepEqual(client.getQueryData(["exam", "hub"]), { name: "GATE CS" });
    assert.equal(catalogState().status, "down");
  });
});

describe("course pages and hover prefetch", () => {
  it("loads three pages, then resumes after page 2 fails", async () => {
    const seen = new Set<string>();
    const calls: number[] = [];
    let fail = true;
    const load = async (offset: number) => {
      calls.push(offset);
      if (offset === 20 && fail) throw new Error("page 2");
      const start = offset;
      return {
        lessons: [
          { uid: `a${start}` },
          { uid: `b${start}` },
        ],
        nextOffset: offset >= 40 ? null : offset + 20,
      };
    };
    const first = await drainCoursePages({
      start: 20,
      seen,
      load,
      signal: new AbortController().signal,
      initial: [{ uid: "a0" }],
    });
    assert.equal(first.status, "error");
    assert.equal(first.failedOffset, 20);
    assert.deepEqual(first.acc.map((row) => row.uid), ["a0"]);
    fail = false;
    const rest = await drainCoursePages({
      start: first.failedOffset ?? 20,
      seen,
      load,
      signal: new AbortController().signal,
      initial: first.acc,
    });
    assert.equal(rest.status, "done");
    assert.deepEqual(calls.filter((n) => n === 0), []);
    assert.deepEqual(rest.acc.map((row) => row.uid), ["a0", "a20", "b20", "a40", "b40"]);
  });

  it("starts at most two hovers, and none while the catalog is down", async () => {
    setCatalogStatus("down");
    let started = 0;
    for (let i = 0; i < 5; i += 1) schedulePrefetch(async () => {
      started += 1;
    });
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(started, 0);

    resetCatalogStatus();
    resetPrefetch();
    const hanging: Array<(value: unknown) => void> = [];
    for (let i = 0; i < 5; i += 1) {
      schedulePrefetch(
        () =>
          new Promise((resolve) => {
            started += 1;
            hanging.push(resolve);
          }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(started, 2);
    hanging.forEach((release) => release(undefined));
  });
});
