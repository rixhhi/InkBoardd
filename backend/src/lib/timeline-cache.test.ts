import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPackedTimeline,
  packTimelineCache,
  readTimelineCache,
  timelineCacheKey,
  unpackTimelineCache,
  writeTimelineCache,
  type TimelineCacheRedis,
} from "./timeline-cache.ts";

describe("timeline cache", () => {
  it("keys a lecture by the packing version and the notes stamp", () => {
    assert.equal(
      timelineCacheKey("v20", "R750YP86336TNLGSA0GF", 'W/"abc".123'),
      "inkboard:timeline:v20:R750YP86336TNLGSA0GF:Wabc.123",
    );
  });

  it("round-trips a packed timeline through gzip and a fake redis", async () => {
    const store = new Map<string, Buffer>();
    const redis: TimelineCacheRedis = {
      async getBuffer(key) {
        return store.get(key) ?? null;
      },
      async set(key, value) {
        store.set(key, Buffer.from(value));
        return "OK";
      },
    };
    const tl = { id: "LESSON", strokes: [{ oid: "a" }], slides: [{ uid: "s" }] };
    const key = timelineCacheKey("v20", "LESSON", "nov");
    await writeTimelineCache(key, tl, redis);
    const got = await readTimelineCache<typeof tl>(key, redis);
    assert.deepEqual(got, tl);
    assert.equal(isPackedTimeline(got), true);
    const raw = await packTimelineCache(tl);
    assert.ok(raw);
    assert.deepEqual(await unpackTimelineCache(raw!), tl);
  });

  it("ignores a cache value that is not a timeline", () => {
    assert.equal(isPackedTimeline({ strokes: [] }), false);
    assert.equal(isPackedTimeline(null), false);
  });
});
