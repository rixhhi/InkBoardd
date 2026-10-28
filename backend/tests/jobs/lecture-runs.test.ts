import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JOB_CAP, forgetJob, lectureRunCount, recordLectureRun } from "../../src/routes/jobs.ts";

describe("lecture run counts", () => {
  it("forgets a count with the job and keeps at most the job cap", () => {
    const stamp = Date.now().toString(36);
    const ids = Array.from({ length: JOB_CAP + 1 }, (_, i) => `cap-${stamp}-${i}`);
    for (const id of ids) recordLectureRun(id);
    const alive = ids.filter((id) => lectureRunCount(id) > 0);
    assert.equal(alive.length, JOB_CAP);
    assert.equal(lectureRunCount(ids[0]!), 0);
    assert.equal(lectureRunCount(ids[JOB_CAP]!), 1);

    const kept = `kept-${stamp}`;
    recordLectureRun(kept);
    assert.equal(lectureRunCount(kept), 1);
    forgetJob(kept);
    assert.equal(lectureRunCount(kept), 0);
  });
});
