import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { rememberJob } from "../../src/routes/jobs.ts";
import { testApp } from "../helpers/app.ts";

describe("job cancel token", () => {
  let app: FastifyInstance;
  after(async () => {
    await app?.close();
  });

  it("rejects a visitor who does not hold the creator token", async () => {
    app = await testApp();
    const dir = mkdtempSync(join(tmpdir(), "ink-own-"));
    rememberJob({
      id: "owned-job",
      kind: "lecture",
      state: "running",
      pct: 1,
      step: "saving",
      outDir: dir,
      payload: {},
      abort: new AbortController(),
      token: "creator-token",
    });
    const stranger = await app.inject({ method: "DELETE", url: "/api/jobs/owned-job" });
    assert.equal(stranger.statusCode, 403);
    assert.equal(stranger.json().code, "FORBIDDEN");
    const wrong = await app.inject({
      method: "DELETE",
      url: "/api/jobs/owned-job",
      headers: { "x-job-token": "someone-else" },
    });
    assert.equal(wrong.statusCode, 403);
    const sameLength = "x".repeat("creator-token".length);
    const mismatch = await app.inject({
      method: "DELETE",
      url: "/api/jobs/owned-job",
      headers: { "x-job-token": sameLength },
    });
    assert.equal(mismatch.statusCode, 403);
    const owner = await app.inject({
      method: "DELETE",
      url: "/api/jobs/owned-job",
      headers: { "x-job-token": "creator-token" },
    });
    assert.equal(owner.statusCode, 200);
    assert.equal(owner.json().state, "cancelled");
  });
});
