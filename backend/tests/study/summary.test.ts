import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boardBullets,
  DEFAULT_XAI_MODEL,
  normalizeSummaryInput,
  parseSummaryText,
  summarizeClass,
} from "../../src/services/summary.ts";

const sample = {
  title: "Newton",
  chapters: [
    { t: 0, label: "Slide 1" },
    { t: 40, label: "Slide 2" },
  ],
  notes: [{ seconds: 12, note: "derive F=ma" }],
};

describe("class summary", () => {
  it("rejects an empty body and drops junk rows", () => {
    assert.throws(() => normalizeSummaryInput({}), /required/);
    const clean = normalizeSummaryInput({
      title: "  Laws  ",
      chapters: [{ t: 1, label: "Inertia" }, { t: -1, label: "nope" }, "bad"],
      notes: [{ seconds: 3, note: "ask\nthis" }],
    });
    assert.equal(clean.title, "Laws");
    assert.equal(clean.chapters.length, 1);
    assert.equal(clean.notes[0]?.note, "ask this");
  });

  it("writes a board outline without calling a model", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("no");
    }) as typeof fetch;
    const result = await summarizeClass(normalizeSummaryInput(sample), { apiKey: "", fetchImpl });
    assert.equal(called, false);
    assert.equal(result.source, "board");
    assert.deepEqual(boardBullets(normalizeSummaryInput(sample)), result.bullets);
    assert.match(result.bullets[1] || "", /Slide 2 · 0:40/);
    assert.match(result.bullets[2] || "", /derive F=ma/);
  });

  it("uses the model once and then the cache", async () => {
    const previous = process.env.XAI_MODEL;
    delete process.env.XAI_MODEL;
    let calls = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      calls += 1;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer test-key");
      assert.doesNotMatch(String(init?.body), /test-key/);
      assert.match(String(init?.body), new RegExp(DEFAULT_XAI_MODEL.replace(/[.]/g, "\\.")));
      assert.match(String(init?.body), /max_tokens":400/);
      return Response.json({
        choices: [{ message: { content: "- Inertia\n- F=ma at the start\n" } }],
      });
    }) as typeof fetch;
    const cache = new Map();
    const input = normalizeSummaryInput(sample);
    try {
      const first = await summarizeClass(input, { apiKey: "test-key", fetchImpl, cache, now: () => 1_000 });
      const second = await summarizeClass(input, { apiKey: "test-key", fetchImpl, cache, now: () => 2_000 });
      assert.equal(calls, 1);
      assert.equal(first.source, "model");
      assert.deepEqual(second.bullets, ["Inertia", "F=ma at the start"]);
      assert.deepEqual(parseSummaryText("1. One\n\n2. Two"), ["One", "Two"]);
    } finally {
      if (previous === undefined) delete process.env.XAI_MODEL;
      else process.env.XAI_MODEL = previous;
    }
  });

  it("does not invent a summary when the model fails", async () => {
    const fetchImpl = (async () => new Response("no", { status: 503 })) as typeof fetch;
    await assert.rejects(
      () => summarizeClass(normalizeSummaryInput(sample), { apiKey: "test-key", fetchImpl, cache: new Map() }),
      /unavailable/,
    );
  });
});
