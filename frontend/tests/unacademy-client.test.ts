import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadExamHub, loadCourseLessons, searchEducators, loadLiveFeed } from "../src/lib/unacademy.ts";
import { loadLessonTimeline, probeReplayMedia } from "../src/lib/lesson-api.ts";
import { searchDesk } from "../src/lib/jump-search.ts";
import { ApiError } from "../src/lib/api-client.ts";

describe("frontend API wrappers", () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  afterEach(() => {
    globalThis.fetch = original;
    calls.length = 0;
  });

  function mockJson(status: number, body: unknown, capture = true) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (capture) calls.push({ url, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  it("loadExamHub hits GET /api/exams/:id/hub with the data bag", async () => {
    mockJson(200, { exam: { id: "YOTUH" }, teachers: [] });
    const page = await loadExamHub({ data: { goalId: "YOTUH" } });
    assert.equal(calls[0]?.url, "/api/exams/YOTUH/hub");
    assert.equal((page as { exam: { id: string } }).exam.id, "YOTUH");
  });

  it("loadCourseLessons forwards offset", async () => {
    mockJson(200, { lessons: [], nextOffset: null, total: 0 });
    await loadCourseLessons({ data: { uid: "COURSE1", offset: 20 } });
    assert.equal(calls[0]?.url, "/api/courses/COURSE1/lessons?offset=20");
  });

  it("searchEducators encodes the query", async () => {
    mockJson(200, { exact: null, hits: [] });
    await searchEducators({ data: { q: "pankaj sir", goalId: "YOTUH" } });
    assert.equal(calls[0]?.url, "/api/search/educators?q=pankaj+sir&goalId=YOTUH");
  });

  it("searchDesk short-circuits under 2 characters", async () => {
    mockJson(200, { teachers: [{ id: "nope" }] });
    const page = await searchDesk({ data: { q: "x" } });
    assert.deepEqual(page, { teachers: [] });
    assert.equal(calls.length, 0);
  });

  it("loadLiveFeed is a POST-less GET", async () => {
    mockJson(200, { live: [], later: [] });
    await loadLiveFeed();
    assert.equal(calls[0]?.url, "/api/live/feed");
  });

  it("loadLessonTimeline rejects junk before fetch", async () => {
    mockJson(200, {});
    await assert.rejects(() => loadLessonTimeline({ data: { id: "nope" } }), /invalid lesson id/i);
    assert.equal(calls.length, 0);
  });

  it("probeReplayMedia POSTs ids", async () => {
    mockJson(200, {});
    await probeReplayMedia({ data: { ids: ["ABCDEF"] } });
    assert.equal(calls[0]?.url, "/api/lessons/probe");
    assert.equal(calls[0]?.init?.method, "POST");
  });

  it("surfaces ApiError from the backend JSON body", async () => {
    mockJson(400, { error: "Unknown exam", code: "BAD_REQUEST" });
    await assert.rejects(
      () => loadExamHub({ data: { goalId: "nope" } }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 400);
        assert.equal(err.code, "BAD_REQUEST");
        return true;
      },
    );
  });
});
