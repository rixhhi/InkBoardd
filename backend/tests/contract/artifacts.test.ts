import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { testApp } from "../helpers/app.ts";
import { rememberJob } from "../../src/routes/jobs.ts";

describe("job artifact contract", () => {
  let app: FastifyInstance;
  before(async () => {
    app = await testApp();
  });
  after(async () => {
    await app.close();
  });

  it("serves an allowlisted sprite manifest and rejects traversal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-job-"));
    writeFileSync(join(dir, "sprites.json"), JSON.stringify({ interval: 10, columns: 1, rows: 1, url: "sprites.webp" }));
    rememberJob({
      id: "job-art",
      kind: "lecture",
      state: "done",
      pct: 100,
      step: "done",
      outDir: dir,
      mediaDir: dir,
      payload: {},
      abort: new AbortController(),
    });
    const ok = await app.inject({ method: "GET", url: "/api/jobs/job-art/artifacts/sprites.json" });
    assert.equal(ok.statusCode, 200);
    assert.match(String(ok.headers["content-type"] || ""), /json/);
    assert.equal(ok.json().interval, 10);
    const bad = await app.inject({ method: "GET", url: "/api/jobs/job-art/artifacts/notes.pdf" });
    assert.equal(bad.statusCode, 400);
    const slip = await app.inject({ method: "GET", url: "/api/jobs/job-art/artifacts/..%2F..%2Fetc%2Fpasswd" });
    assert.equal(slip.statusCode, 400);
    const missing = await app.inject({ method: "GET", url: "/api/jobs/missing/artifacts/sprites.json" });
    assert.equal(missing.statusCode, 404);
  });

  it("serves one byte range and answers 416 when it cannot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-range-"));
    const payload = Buffer.from("abcdefghijklmnopqrstuvwxyz");
    writeFileSync(join(dir, "waveform.png"), payload);
    rememberJob({
      id: "job-range",
      kind: "lecture",
      state: "done",
      pct: 100,
      step: "done",
      outDir: dir,
      mediaDir: dir,
      payload: {},
      abort: new AbortController(),
    });
    const partial = await app.inject({
      method: "GET",
      url: "/api/jobs/job-range/artifacts/waveform.png",
      headers: { range: "bytes=0-3" },
    });
    assert.equal(partial.statusCode, 206);
    assert.equal(partial.headers["accept-ranges"], "bytes");
    assert.equal(partial.headers["content-range"], "bytes 0-3/26");
    assert.equal(partial.headers["content-length"], "4");
    assert.equal(partial.body, "abcd");

    const suffix = await app.inject({
      method: "GET",
      url: "/api/jobs/job-range/artifacts/waveform.png",
      headers: { range: "bytes=-4" },
    });
    assert.equal(suffix.statusCode, 206);
    assert.equal(suffix.headers["content-range"], "bytes 22-25/26");
    assert.equal(suffix.body, "wxyz");

    const open = await app.inject({
      method: "GET",
      url: "/api/jobs/job-range/artifacts/waveform.png",
      headers: { range: "bytes=24-" },
    });
    assert.equal(open.statusCode, 206);
    assert.equal(open.headers["content-range"], "bytes 24-25/26");
    assert.equal(open.body, "yz");

    const bad = await app.inject({
      method: "GET",
      url: "/api/jobs/job-range/artifacts/waveform.png",
      headers: { range: "bytes=40-50" },
    });
    assert.equal(bad.statusCode, 416);
    assert.equal(bad.headers["content-range"], "bytes */26");
    assert.equal(bad.headers["accept-ranges"], "bytes");

    const denied = await app.inject({
      method: "GET",
      url: "/api/jobs/job-range/artifacts/notes.pdf",
      headers: { range: "bytes=0-3" },
    });
    assert.equal(denied.statusCode, 400);

    const full = await app.inject({ method: "GET", url: "/api/jobs/job-range/artifacts/waveform.png" });
    assert.equal(full.statusCode, 200);
    assert.equal(full.headers["accept-ranges"], "bytes");
    assert.equal(full.headers["content-range"], undefined);
    assert.equal(full.body, payload.toString());
  });
});
