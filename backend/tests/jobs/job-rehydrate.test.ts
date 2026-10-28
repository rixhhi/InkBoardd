import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";

const root = mkdtempSync(join(tmpdir(), "ink-keep-"));
process.env.JOB_DIR = root;
process.env.LOG_LEVEL = "silent";
delete process.env.TRUST_PROXY;

function writeJob(dir: string, body: Record<string, unknown>, when: Date) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "job.json");
  writeFileSync(file, JSON.stringify(body));
  utimesSync(file, when, when);
  utimesSync(dir, when, when);
}

describe("a done job still serves after the finished ttl and a restart", () => {
  let app: FastifyInstance | undefined;

  after(async () => {
    await app?.close();
  });

  it("serves artifacts and clips past FINISHED_TTL_MS, then again from disk", async () => {
    const { FINISHED_TTL_MS, evictFinishedJobs, forgetJob, jobView } = await import("../../src/routes/jobs.ts");
    const { testApp } = await import("../helpers/app.ts");
    const { clipFileName } = await import("../../src/integrations/ffmpeg/plan.ts");
    const id = "keptjob01";
    const dir = join(root, id);
    const old = new Date(Date.now() - FINISHED_TTL_MS - 60_000);
    writeJob(
      dir,
      {
        id,
        kind: "lecture",
        state: "done",
        pct: 100,
        step: "done",
        outDir: dir,
        mediaDir: dir,
        payload: { id: "lesson01" },
      },
      old,
    );
    writeFileSync(join(dir, "sprites.json"), JSON.stringify({ interval: 10 }));
    writeFileSync(join(dir, "media.mp4"), "media");
    const rel = clipFileName(1, 3);
    mkdirSync(join(dir, "clips"), { recursive: true });
    writeFileSync(join(dir, rel), "clip");

    app = await testApp();
    evictFinishedJobs();
    assert.equal(jobView(id)?.state, "done");

    const art = await app.inject({ method: "GET", url: `/api/jobs/${id}/artifacts/sprites.json` });
    assert.equal(art.statusCode, 200);
    assert.equal(art.json().interval, 10);
    const clip = await app.inject({ method: "POST", url: `/api/jobs/${id}/clips`, payload: { start: 1, end: 3 } });
    assert.equal(clip.statusCode, 200);
    assert.match(clip.json().url, /clips\/clip-1000-3000\.mp4/);

    forgetJob(id);
    assert.equal(jobView(id), null);
    const again = await app.inject({ method: "GET", url: `/api/jobs/${id}/artifacts/sprites.json` });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().interval, 10);
    const clipAgain = await app.inject({ method: "POST", url: `/api/jobs/${id}/clips`, payload: { start: 1, end: 3 } });
    assert.equal(clipAgain.statusCode, 200);
    const status = await app.inject({ method: "GET", url: `/api/jobs/${id}` });
    assert.equal(status.statusCode, 200);
    assert.equal(status.json().state, "done");

    const restarted = "retryjob1";
    const failed = join(root, `${restarted}-aaaaaaaa`);
    const done = join(root, `${restarted}-bbbbbbbb`);
    writeJob(
      failed,
      { id: restarted, kind: "lecture", state: "error", pct: 0, step: "error", outDir: failed, mediaDir: failed, payload: {} },
      new Date(Date.now() - 120_000),
    );
    writeFileSync(join(failed, "sprites.json"), JSON.stringify({ interval: 1 }));
    writeJob(
      done,
      { id: restarted, kind: "lecture", state: "done", pct: 100, step: "done", outDir: done, mediaDir: done, payload: {} },
      new Date(),
    );
    writeFileSync(join(done, "sprites.json"), JSON.stringify({ interval: 20 }));
    writeFileSync(join(done, "media.mp4"), "media");
    mkdirSync(join(done, "clips"), { recursive: true });
    writeFileSync(join(done, rel), "clip");
    const fresh = await app.inject({ method: "GET", url: `/api/jobs/${restarted}/artifacts/sprites.json` });
    assert.equal(fresh.statusCode, 200);
    assert.equal(fresh.json().interval, 20);
    const freshClip = await app.inject({
      method: "POST",
      url: `/api/jobs/${restarted}/clips`,
      payload: { start: 1, end: 3 },
    });
    assert.equal(freshClip.statusCode, 200);
  });
});
