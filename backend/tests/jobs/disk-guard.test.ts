import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { diskTooFull, freeBytes, pruneJobDirs } from "../../src/routes/jobs.ts";

function fakeJob(root: string, name: string, bytes: number, ageSec: number) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "job.json"), JSON.stringify({ id: name, kind: "lecture", state: "done" }));
  writeFileSync(join(dir, "media.bin"), Buffer.alloc(bytes));
  const t = Date.now() / 1000 - ageSec;
  utimesSync(dir, t, t);
  return dir;
}

describe("job disk guard", () => {
  it("reports free space and refuses below the floor", () => {
    const root = mkdtempSync(join(tmpdir(), "ib-disk-"));
    assert.ok(freeBytes(root) > 0);
    assert.equal(diskTooFull(root, 0), false);
    assert.equal(diskTooFull(root, Number.MAX_SAFE_INTEGER), true);
  });

  it("deletes the oldest finished job folders until the total fits", () => {
    const root = mkdtempSync(join(tmpdir(), "ib-prune-"));
    const oldest = fakeJob(root, "old", 40_000, 300);
    const middle = fakeJob(root, "mid", 40_000, 200);
    const newest = fakeJob(root, "new", 40_000, 100);
    mkdirSync(join(root, "not-a-job"));
    const { removed } = pruneJobDirs(root, 90_000);
    assert.deepEqual(removed, [oldest]);
    assert.equal(existsSync(oldest), false);
    assert.ok(existsSync(middle) && existsSync(newest));
    assert.ok(existsSync(join(root, "not-a-job")), "folders without job.json are left alone");
  });

  it("does nothing under the cap", () => {
    const root = mkdtempSync(join(tmpdir(), "ib-prune2-"));
    fakeJob(root, "a", 1000, 10);
    assert.deepEqual(pruneJobDirs(root, 1_000_000).removed, []);
  });
});
