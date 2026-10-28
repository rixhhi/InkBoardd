import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jobStepLogger } from "../../src/routes/jobs.ts";

/**
 * `saveLecture` calls `log.info`, `log.warn`, `log.progress?.()` and
 * `log.newline?.()`. A bare function here once made every lecture job fail
 * with "logger.info is not a function" before a single byte was fetched.
 */
describe("job step logger", () => {
  it("has every method saveLecture calls", () => {
    const job = { step: "saving", pct: 0 };
    const log = jobStepLogger(job);
    for (const name of ["info", "warn", "error", "progress", "newline"] as const) {
      assert.equal(typeof log[name], "function", `${name} is a function`);
    }
  });

  it("mirrors each line into step and lifts a percentage into pct", () => {
    const job = { step: "saving", pct: 0 };
    const log = jobStepLogger(job);
    log.info("Saving KJ95JT2FZAXBTV72URS9");
    assert.equal(job.step, "Saving KJ95JT2FZAXBTV72URS9");
    assert.equal(job.pct, 0);
    log.progress("media 42%  1.20 MB/s");
    assert.equal(job.step, "media 42%  1.20 MB/s");
    assert.equal(job.pct, 42);
    log.progress("media 100%  1.20 MB/s");
    assert.equal(job.pct, 99, "the runner sets 100 only when the job is done");
    log.newline();
    log.warn("x".repeat(400));
    const step: string = job.step;
    assert.equal(step.length, 180);
  });
});
