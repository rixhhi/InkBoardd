import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advanceDownload, enqueueDownload, pauseDownload, rejectDownload, resumeDownload } from "./download-queue.ts";
import { storageCopy, storagePressure } from "./storage-pressure.ts";

describe("download queue", () => {
  it("runs one download, keeps the offset when paused, and continues", () => {
    let jobs = enqueueDownload([], "a", 100);
    jobs = enqueueDownload(jobs, "b", 50);
    assert.equal(jobs.find((job) => job.id === "a")?.status, "running");
    assert.equal(jobs.find((job) => job.id === "b")?.status, "queued");
    jobs = advanceDownload(jobs, "a", 40);
    assert.equal(jobs.find((job) => job.id === "a")?.offset, 40);
    jobs = pauseDownload(jobs, "a");
    assert.equal(jobs.find((job) => job.id === "a")?.status, "paused");
    assert.equal(jobs.find((job) => job.id === "a")?.offset, 40);
    assert.equal(jobs.find((job) => job.id === "b")?.status, "running");
    jobs = resumeDownload(jobs, "a");
    assert.equal(jobs.find((job) => job.id === "a")?.status, "queued");
    jobs = advanceDownload(jobs, "b", 50);
    assert.equal(jobs.find((job) => job.id === "b")?.status, "done");
    assert.equal(jobs.find((job) => job.id === "a")?.status, "running");
    assert.equal(jobs.find((job) => job.id === "a")?.offset, 40);
  });

  it("fails a bad checksum without marking the file done", () => {
    let jobs = enqueueDownload([], "a", 10, "abc");
    jobs = advanceDownload(jobs, "a", 10);
    jobs = rejectDownload(jobs, "a", "nope");
    assert.equal(jobs[0]?.status, "failed");
    assert.equal(jobs[0]?.offset, 10);
  });

  it("warns when the device is nearly full", () => {
    assert.equal(storagePressure(89, 100), "ok");
    assert.equal(storagePressure(90, 100), "warn");
    assert.equal(storagePressure(100, 100), "full");
    assert.equal(storageCopy("full"), "This device is full. Remove a saved lecture before downloading another.");
  });
});

