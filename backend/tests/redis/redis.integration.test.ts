/**
 * Real-Redis integration: the ioredis client wiring, the Lua rate limiter and the gzip timeline cache.
 * Starts its own redis-server (or uses REDIS_TEST_URL); skips when neither is available.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startTestRedis, type TestRedis } from "../helpers/redis-server.ts";

let redis: TestRedis | null = null;
// REDIS_URL is read when config/env.ts loads, so it is set before anything imports it.
const mods: {
  client?: typeof import("../../src/repositories/redis/client.ts");
  rate?: typeof import("../../src/middlewares/rate-limit.ts");
  cache?: typeof import("../../src/lib/timeline-cache.ts");
  Redis?: typeof import("ioredis").default;
} = {};
let admin: InstanceType<typeof import("ioredis").default>;

before(async () => {
  redis = await startTestRedis();
  if (!redis) return;
  process.env.REDIS_URL = redis.url;
  mods.client = await import("../../src/repositories/redis/client.ts");
  mods.rate = await import("../../src/middlewares/rate-limit.ts");
  mods.cache = await import("../../src/lib/timeline-cache.ts");
  mods.Redis = (await import("ioredis")).default;
  admin = new mods.Redis(redis.url);
});

after(async () => {
  if (!redis) return;
  admin?.disconnect();
  (await mods.client?.getRedis())?.quit().catch(() => undefined);
  await redis.stop();
});

function skipUnlessRedis(t: { skip: (m?: string) => void }) {
  if (!redis) {
    t.skip("no redis-server on PATH and no REDIS_TEST_URL");
    return true;
  }
  return false;
}

describe("redis client (ioredis 6)", () => {
  it("connects and pings", async (t) => {
    if (skipUnlessRedis(t)) return;
    assert.equal(mods.client!.redisConfigured(), true);
    assert.equal(await mods.client!.pingRedis(), "ok");
  });

  it("reuses one connection across calls", async (t) => {
    if (skipUnlessRedis(t)) return;
    assert.equal(await mods.client!.getRedis(), await mods.client!.getRedis());
  });
});

describe("rate limiter on real redis (Lua INCR + PEXPIRE)", () => {
  it("allows up to the limit then refuses", async (t) => {
    if (skipUnlessRedis(t)) return;
    const ip = `t-limit-${Date.now()}`;
    const got: boolean[] = [];
    for (let i = 0; i < 5; i += 1) got.push(await mods.rate!.allowRate(ip, 3, 5_000));
    assert.deepEqual(got, [true, true, true, false, false]);
  });

  it("counts each caller separately", async (t) => {
    if (skipUnlessRedis(t)) return;
    const a = `t-a-${Date.now()}`;
    const b = `t-b-${Date.now()}`;
    assert.equal(await mods.rate!.allowRate(a, 1, 5_000), true);
    assert.equal(await mods.rate!.allowRate(a, 1, 5_000), false);
    assert.equal(await mods.rate!.allowRate(b, 1, 5_000), true);
  });

  it("sets the window expiry on the first hit only, and lets the caller back in after it", async (t) => {
    if (skipUnlessRedis(t)) return;
    const ip = `t-win-${Date.now()}`;
    const key = `rl:1:600:${ip}`;
    assert.equal(await mods.rate!.allowRate(ip, 1, 600), true);
    const ttl1 = await admin.pttl(key);
    assert.ok(ttl1 > 0 && ttl1 <= 600, `ttl ${ttl1}`);
    assert.equal(await mods.rate!.allowRate(ip, 1, 600), false);
    const ttl2 = await admin.pttl(key);
    assert.ok(ttl2 <= ttl1, "a refused hit must not extend the window");
    await new Promise((r) => setTimeout(r, 750));
    assert.equal(await mods.rate!.allowRate(ip, 1, 600), true);
  });

  it("keeps limit and window in the key so different caps do not share a counter", async (t) => {
    if (skipUnlessRedis(t)) return;
    const ip = `t-cap-${Date.now()}`;
    assert.equal(await mods.rate!.allowRate(ip, 1, 4_000), true);
    assert.equal(await mods.rate!.allowRate(ip, 1, 4_000), false);
    assert.equal(await mods.rate!.allowRate(ip, 2, 4_000), true);
  });
});

describe("timeline cache on real redis", () => {
  const timeline = (n: number) => ({
    id: "L",
    strokes: Array.from({ length: n }, (_, i) => ({ oid: `s${i}`, pts: [i, i + 1, i + 2] })),
    slides: [{ uid: "blank" }],
  });

  it("round-trips a gzip buffer byte for byte", async (t) => {
    if (skipUnlessRedis(t)) return;
    const c = mods.cache!;
    const key = c.timelineCacheKey("vT", "RT", `n${Date.now()}`);
    const tl = timeline(500);
    await c.writeTimelineCache(key, tl);
    const got = await c.readTimelineCache<ReturnType<typeof timeline>>(key);
    assert.deepEqual(got, tl);
    const raw = await admin.getBuffer(key);
    assert.ok(raw && raw[0] === 0x1f && raw[1] === 0x8b, "stored value is gzip, not text");
  });

  it("expires after the three-day TTL", async (t) => {
    if (skipUnlessRedis(t)) return;
    const c = mods.cache!;
    const key = c.timelineCacheKey("vT", "TTL", `n${Date.now()}`);
    await c.writeTimelineCache(key, timeline(3));
    const ttl = await admin.ttl(key);
    assert.ok(ttl > 3 * 24 * 3600 - 60 && ttl <= 3 * 24 * 3600, `ttl ${ttl}`);
  });

  it("misses cleanly on an absent key and on garbage bytes", async (t) => {
    if (skipUnlessRedis(t)) return;
    const c = mods.cache!;
    assert.equal(await c.readTimelineCache("inkboard:timeline:vT:none:none"), null);
    const bad = "inkboard:timeline:vT:bad:bad";
    await admin.set(bad, Buffer.from([1, 2, 3, 4]));
    assert.equal(await c.readTimelineCache(bad), null);
  });

  it("separates versions and stamps", async (t) => {
    if (skipUnlessRedis(t)) return;
    const c = mods.cache!;
    const stamp = `s${Date.now()}`;
    const k1 = c.timelineCacheKey("vA", "SEP", stamp);
    const k2 = c.timelineCacheKey("vB", "SEP", stamp);
    await c.writeTimelineCache(k1, timeline(1));
    assert.equal(await c.readTimelineCache(k2), null);
    assert.ok(await c.readTimelineCache(k1));
  });
});
