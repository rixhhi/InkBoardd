import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FINISHED_TTL_MS,
  JOB_CAP,
  evictFinishedJobs,
  jobCount,
  jobView,
  loadStoredJobs,
  markFinished,
  rememberJob,
} from "../../src/routes/jobs.ts";

function job(id: string, state: "done" | "error" | "cancelled" | "running", dir: string) {
  return {
    id,
    kind: "lecture" as const,
    state,
    pct: state === "done" ? 100 : 1,
    step: state,
    outDir: dir,
    payload: {},
    abort: new AbortController(),
  };
}

describe("finished jobs are evicted only above the cap", () => {
  it("keeps an old finished job under the cap, then drops error and cancelled before done", () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-cap-"));
    rememberJob(job("stay-done", "done", dir));
    rememberJob(job("stay-live", "running", dir));
    markFinished("stay-done", Date.now() - FINISHED_TTL_MS - 5);
    evictFinishedJobs();
    assert.equal(jobView("stay-done")?.state, "done");
    assert.equal(jobView("stay-live")?.state, "running");

    for (let i = 0; i < JOB_CAP; i += 1) {
      const id = `fill-${i}`;
      rememberJob(job(id, "done", dir), false);
      markFinished(id, 1_000 + i);
    }
    rememberJob(job("err-old", "error", dir), false);
    markFinished("err-old", 50);
    rememberJob(job("err-new", "error", dir), false);
    markFinished("err-new", 8_000_000);
    rememberJob(job("cancel-new", "cancelled", dir), false);
    markFinished("cancel-new", 9_000_000);
    assert.equal(jobCount(), JOB_CAP + 5);

    evictFinishedJobs();
    assert.equal(jobCount(), JOB_CAP);
    assert.equal(jobView("err-old"), null);
    assert.equal(jobView("err-new"), null);
    assert.equal(jobView("cancel-new"), null);
    assert.equal(jobView("fill-0"), null);
    assert.equal(jobView("fill-1"), null);
    assert.equal(jobView("fill-2")?.state, "done");
    assert.equal(jobView("stay-live")?.state, "running");
    assert.equal(jobView("stay-done")?.state, "done");

    const extra = mkdtempSync(join(tmpdir(), "ink-load-"));
    for (const id of ["loaded-a", "loaded-b", "loaded-c"]) {
      const folder = join(extra, id);
      mkdirSync(folder, { recursive: true });
      writeFileSync(
        join(folder, "job.json"),
        JSON.stringify({ id, kind: "lecture", state: "done", pct: 100, step: "done", outDir: folder, payload: {} }),
      );
    }
    const before = jobCount();
    assert.equal(loadStoredJobs(extra), 3);
    assert.equal(jobCount(), before + 3);
    assert.equal(jobView("loaded-a")?.state, "done");
  });
});
