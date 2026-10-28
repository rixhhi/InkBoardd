import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backoffMs, fetchWithRetry, isRetryableError, shouldRetryStatus } from "@inkboard/shared/fetch-retry";

describe("fetch retry helpers", () => {
  it("retries 429/5xx but not 404/403", () => {
    assert.equal(shouldRetryStatus(429), true);
    assert.equal(shouldRetryStatus(503), true);
    assert.equal(shouldRetryStatus(404), false);
    assert.equal(shouldRetryStatus(403), false);
  });

  it("applies exponential backoff with injectable jitter", () => {
    assert.equal(backoffMs(0, 100, () => 0), 100);
    assert.equal(backoffMs(1, 100, () => 0), 200);
    assert.equal(backoffMs(2, 100, () => 0), 400);
    assert.equal(backoffMs(8, 100, () => 0), 4000);
  });

  it("treats timeouts as retryable", () => {
    const timeout = new Error("The operation was aborted");
    timeout.name = "TimeoutError";
    assert.equal(isRetryableError(timeout), true);
    assert.equal(isRetryableError(new Error("nope")), false);
  });

  it("retries a 503 then returns the success", async () => {
    let n = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      n += 1;
      if (n === 1) return new Response("busy", { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    try {
      const res = await fetchWithRetry("https://example.test/x", { retries: 2, baseMs: 1, timeoutMs: 1000 });
      assert.equal(res.status, 200);
      assert.equal(n, 2);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does not retry a 404", async () => {
    let n = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      n += 1;
      return new Response("missing", { status: 404 });
    }) as typeof fetch;
    try {
      const res = await fetchWithRetry("https://example.test/x", { retries: 3, baseMs: 1 });
      assert.equal(res.status, 404);
      assert.equal(n, 1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("retries a network error then succeeds", async () => {
    let n = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      n += 1;
      if (n === 1) {
        const err = new Error("fetch failed");
        err.name = "TypeError";
        throw err;
      }
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    try {
      const res = await fetchWithRetry("https://example.test/x", { retries: 2, baseMs: 1, timeoutMs: 1000 });
      assert.equal(res.status, 200);
      assert.equal(n, 2);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("keeps the abort timer until the body is consumed", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          await new Promise((r) => setTimeout(r, 40));
          controller.enqueue(new TextEncoder().encode("{\"ok\":true}"));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;
    try {
      const res = await fetchWithRetry("https://example.test/x", { retries: 0, timeoutMs: 200, budgetMs: 500 });
      const json = await res.json();
      assert.deepEqual(json, { ok: true });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("budgets total time across retries", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      await new Promise((r) => setTimeout(r, 80));
      const err = new Error("fetch failed");
      err.name = "TypeError";
      throw err;
    }) as typeof fetch;
    const t0 = Date.now();
    try {
      await assert.rejects(
        () => fetchWithRetry("https://example.test/x", { retries: 3, timeoutMs: 200, baseMs: 1, budgetMs: 150 }),
      );
      assert.ok(Date.now() - t0 < 400);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("cancels the body of a retried 503", async () => {
    let cancelled = false;
    let n = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      n += 1;
      if (n === 1) {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
          cancel() {
            cancelled = true;
          },
        });
        return new Response(body, { status: 503 });
      }
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    try {
      const res = await fetchWithRetry("https://example.test/retry-body", { retries: 1, baseMs: 1, timeoutMs: 1000 });
      assert.equal(res.status, 200);
      assert.equal(cancelled, true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

