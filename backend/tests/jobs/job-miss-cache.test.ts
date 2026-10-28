import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { JOB_MISS_CAP, JOB_MISS_MS, jobDirReadCount, jobMissCount, rehydrateJob, sweepMissingJobs } from "../../src/routes/jobs.ts";

describe("unknown job ids are not listed twice", () => {
  it("caches a miss for about 30 seconds, then reads the directory again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-miss-"));
    const id = "missingjob1";
    const now = 1_700_000_000_000;
    const before = jobDirReadCount();
    assert.equal(await rehydrateJob(id, dir, now), null);
    assert.equal(await rehydrateJob(id, dir, now + 1_000), null);
    assert.equal(jobDirReadCount(), before + 1);
    assert.equal(await rehydrateJob("../etc/passwd", dir, now), null);
    assert.equal(jobDirReadCount(), before + 1);

    const jobDir = join(dir, id);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(
      join(jobDir, "job.json"),
      JSON.stringify({
        id,
        kind: "lecture",
        state: "done",
        pct: 100,
        step: "done",
        outDir: jobDir,
        payload: {},
      }),
    );
    assert.equal(await rehydrateJob(id, dir, now + JOB_MISS_MS - 1), null);
    assert.equal(jobDirReadCount(), before + 1);
    const found = await rehydrateJob(id, dir, now + JOB_MISS_MS);
    assert.equal(found?.state, "done");
    assert.equal(found?.outDir, jobDir);
    assert.equal(jobDirReadCount(), before + 2);
  });

  it("keeps a flood of unknown ids under the cap and drops them once they expire", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-miss-cap-"));
    const now = 1_700_000_000_000;
    const first = "flood0";
    const last = `flood${JOB_MISS_CAP}`;
    for (let i = 0; i <= JOB_MISS_CAP; i += 1) {
      assert.equal(await rehydrateJob(`flood${i}`, dir, now), null);
    }
    assert.equal(jobMissCount() <= JOB_MISS_CAP, true);
    assert.equal(jobMissCount(), JOB_MISS_CAP);
    const reads = jobDirReadCount();
    assert.equal(await rehydrateJob(last, dir, now + 1), null);
    assert.equal(jobDirReadCount(), reads);
    assert.equal(await rehydrateJob(first, dir, now + 1), null);
    assert.equal(jobDirReadCount(), reads + 1);
    sweepMissingJobs(now + 1 + JOB_MISS_MS);
    assert.equal(jobMissCount(), 0);
  });
});
