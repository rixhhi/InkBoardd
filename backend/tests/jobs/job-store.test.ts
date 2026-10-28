import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FINISHED_TTL_MS,
  allocateOutDir,
  evictFinishedJobs,
  jobCount,
  jobView,
  loadStoredJobs,
  markFinished,
  rememberJob,
} from "../../src/routes/jobs.ts";

describe("job store", () => {
  it("reloads a finished job and marks an interrupted one as failed", () => {
    const root = mkdtempSync(join(tmpdir(), "ink-jobs-"));
    const doneDir = join(root, "done-job");
    const runDir = join(root, "run-job");
    mkdirSync(doneDir, { recursive: true });
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(doneDir, "sprites.json"), "{}");
    writeFileSync(
      join(doneDir, "job.json"),
      JSON.stringify({
        id: "done-job",
        kind: "lecture",
        state: "done",
        pct: 100,
        step: "done",
        outDir: doneDir,
        mediaDir: doneDir,
        payload: { id: "abc12345" },
      }),
    );
    writeFileSync(
      join(runDir, "job.json"),
      JSON.stringify({
        id: "run-job",
        kind: "lecture",
        state: "running",
        pct: 10,
        step: "enhancing",
        outDir: runDir,
        payload: {},
      }),
    );
    const loaded = loadStoredJobs(root);
    assert.equal(loaded, 2);
    assert.equal(jobView("done-job")?.state, "done");
    assert.equal(jobView("done-job")?.mediaDir, doneDir);
    assert.equal(jobView("run-job")?.state, "error");
    assert.match(jobView("run-job")?.error || "", /Interrupted/);
    rememberJob({
      id: "memory-only",
      kind: "lecture",
      state: "done",
      pct: 100,
      step: "done",
      outDir: doneDir,
      payload: {},
      abort: new AbortController(),
    });
    assert.equal(jobView("memory-only")?.state, "done");
  });

  it("does not evict a finished job by age while the map is under the cap", () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-ttl-"));
    rememberJob({
      id: "ttl-done",
      kind: "lecture",
      state: "done",
      pct: 100,
      step: "done",
      outDir: dir,
      payload: {},
      abort: new AbortController(),
    });
    rememberJob({
      id: "ttl-live",
      kind: "lecture",
      state: "running",
      pct: 10,
      step: "saving",
      outDir: dir,
      payload: {},
      abort: new AbortController(),
    });
    markFinished("ttl-done", Date.now() - FINISHED_TTL_MS - 5);
    const before = jobCount();
    assert.ok(before >= 2);
    evictFinishedJobs();
    assert.equal(jobCount(), before);
    assert.equal(jobView("ttl-done")?.state, "done");
    assert.equal(jobView("ttl-live")?.state, "running");
  });

  it("does not reuse the old directory when a failed job is restarted", () => {
    const root = mkdtempSync(join(tmpdir(), "ink-outdir-"));
    const first = allocateOutDir(root, "lessonjob", false);
    assert.equal(first, join(root, "lessonjob"));
    mkdirSync(first, { recursive: true });
    writeFileSync(join(first, "job.json"), "{}");
    const again = allocateOutDir(root, "lessonjob", true);
    assert.notEqual(again, first);
    assert.equal(again.startsWith(root), true);
    assert.equal(allocateOutDir(root, "freshjob", false), join(root, "freshjob"));
  });

  it("evicts from the create route and on a timer", () => {
    const src = readFileSync(new URL("../../src/routes/jobs.ts", import.meta.url), "utf8");
    assert.match(src, /setInterval\(\(\) => \{[\s\S]*evictFinishedJobs\(\);[\s\S]*sweepMissingJobs\(\);[\s\S]*\}, 60_000\)/);
    const post = src.slice(src.indexOf('app.post("/api/jobs/lectures"'));
    assert.match(post, /evictFinishedJobs\(\)/);
    assert.match(src, /markFinished\(job\.id\)/);
  });
});
