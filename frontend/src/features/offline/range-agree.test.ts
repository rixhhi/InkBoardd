import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { rangeReply } from "../../../public/offline-range.js";
import { sliceRange } from "./range.ts";

const bytes = new Uint8Array([10, 20, 30, 40, 50]);

describe("saved lecture ranges", () => {
  for (const header of [null, "bytes=1-3", "bytes=4-", "bytes=-2", "bytes=9-9", "nope"]) {
    it(`agrees on ${header ?? "the whole file"}`, () => {
      const fromTs = sliceRange(bytes, header);
      const fromWorker = rangeReply(bytes.length, header, "video/mp4");
      assert.equal(fromTs?.status ?? null, fromWorker?.status ?? null);
      if (!fromTs || !fromWorker) return;
      if (fromWorker.status === 416) {
        assert.equal(fromTs.body.length, 0);
        assert.equal(fromWorker.contentRange, fromTs.contentRange);
        return;
      }
      assert.equal(fromTs.body.length, fromWorker.end - fromWorker.start + 1);
      assert.deepEqual([...fromTs.body], [...bytes.subarray(fromWorker.start, fromWorker.end + 1)]);
      if (fromWorker.status === 206) assert.equal(fromWorker.contentRange, fromTs.contentRange);
      else assert.equal(fromWorker.contentRange, null);
    });
  }

  it("the worker slices the cached blob and only advertises Content-Range on 206 and 416", () => {
    const src = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
    assert.match(src, /blob\.slice\(reply\.start, reply\.end \+ 1\)/);
    assert.doesNotMatch(src, /arrayBuffer\(/);
    assert.match(src, /reply\.status === 206 && reply\.contentRange/);
    assert.match(src, /reply\.status === 416/);
    assert.doesNotMatch(src, /status === 200[\s\S]{0,80}Content-Range/);
  });
});
