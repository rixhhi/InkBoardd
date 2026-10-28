import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enhanceConcurrency, enhanceInflight, enqueueEnhance } from "../../src/integrations/ffmpeg/pipeline.ts";

describe("ffmpeg queue", () => {
  it("never runs more than the cap during a 20-job burst", async () => {
    const previous = process.env.FFMPEG_CONCURRENCY;
    process.env.FFMPEG_CONCURRENCY = "1";
    let max = 0;
    try {
      assert.equal(enhanceConcurrency(), 1);
      const jobs = Array.from({ length: 20 }, () =>
        enqueueEnhance(async () => {
          max = Math.max(max, enhanceInflight());
          await new Promise((resolve) => setTimeout(resolve, 8));
        }),
      );
      await Promise.all(jobs);
      assert.equal(max, 1);
    } finally {
      if (previous === undefined) delete process.env.FFMPEG_CONCURRENCY;
      else process.env.FFMPEG_CONCURRENCY = previous;
    }
  });
});
