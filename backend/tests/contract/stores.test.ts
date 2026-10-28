import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { postgresConfigured, pingPostgres } from "../../src/repositories/postgres/client.ts";
import { redisConfigured, pingRedis } from "../../src/repositories/redis/client.ts";
import { ffmpegStatus } from "../../src/integrations/ffmpeg/probe.ts";
import { isHollow, swr, swrPeek, swrReset } from "../../src/lib/swr-cache.ts";

describe("store adapters", () => {
  it("postgres/redis report skip when URLs are absent", async () => {
    if (!postgresConfigured()) assert.equal(await pingPostgres(), "skip");
    else assert.ok(["ok", "error"].includes(await pingPostgres()));
    if (!redisConfigured()) assert.equal(await pingRedis(), "skip");
    else assert.ok(["ok", "error"].includes(await pingRedis()));
  });

  it("ffmpeg probe never throws", () => {
    assert.ok(["ok", "missing"].includes(ffmpegStatus()));
  });

  it("swr serves memory hits without calling the producer twice", async () => {
    swrReset();
    let n = 0;
    const a = await swr("k", 60_000, async () => {
      n += 1;
      return { teachers: [1] };
    });
    const b = await swr("k", 60_000, async () => {
      n += 1;
      return { teachers: [2] };
    });
    assert.deepEqual(a, { teachers: [1] });
    assert.deepEqual(b, { teachers: [1] });
    assert.equal(n, 1);
    assert.deepEqual(swrPeek("k"), { teachers: [1] });
    swrReset();
    assert.equal(swrPeek("k"), undefined);
  });

  it("hollow payloads are not remembered", async () => {
    swrReset();
    await swr("empty", 60_000, async () => ({ teachers: [] as unknown[] }));
    assert.equal(swrPeek("empty"), undefined);
    assert.equal(isHollow({ teachers: [] }), true);
    assert.equal(isHollow({ teachers: [1] }), false);
    swrReset();
  });
});
