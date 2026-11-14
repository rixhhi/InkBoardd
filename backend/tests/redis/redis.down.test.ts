/** Redis configured but unreachable: nothing may hang or throw; callers fall back to memory. */
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { after, before, describe, it } from "node:test";

let url = "";
const mods: {
  client?: typeof import("../../src/repositories/redis/client.ts");
  rate?: typeof import("../../src/middlewares/rate-limit.ts");
  cache?: typeof import("../../src/lib/timeline-cache.ts");
} = {};

before(async () => {
  // A port that was free a moment ago and has nothing listening on it.
  const port = await new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
  url = `redis://127.0.0.1:${port}`;
  process.env.REDIS_URL = url;
  mods.client = await import("../../src/repositories/redis/client.ts");
  mods.rate = await import("../../src/middlewares/rate-limit.ts");
  mods.cache = await import("../../src/lib/timeline-cache.ts");
});

after(async () => {
  (await mods.client?.getRedis().catch(() => null))?.quit().catch(() => undefined);
});

describe("redis unreachable", () => {
  it("ping reports an error instead of throwing", async () => {
    assert.equal(await mods.client!.pingRedis(), "error");
  });

  it("rate limiting falls back to the in-memory counter and still enforces the limit", async () => {
    const ip = `down-${Date.now()}`;
    const started = Date.now();
    const got: boolean[] = [];
    for (let i = 0; i < 3; i += 1) got.push(await mods.rate!.allowRate(ip, 2, 5_000));
    assert.deepEqual(got, [true, true, false]);
    assert.ok(Date.now() - started < 5_000, "fallback must not wait on the dead server");
  });

  it("timeline cache reads miss and writes are dropped without throwing", async () => {
    const key = mods.cache!.timelineCacheKey("vD", "DOWN", "x");
    assert.equal(await mods.cache!.readTimelineCache(key), null);
    await mods.cache!.writeTimelineCache(key, { id: "x", strokes: [], slides: [] });
  });
});
