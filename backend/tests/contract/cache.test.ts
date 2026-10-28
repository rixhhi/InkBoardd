import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cacheGet, cacheSet, probeGet, probeSet } from "../../src/repositories/postgres/cache.ts";
import { postgresConfigured } from "../../src/repositories/postgres/client.ts";
import { ffmpegBinary, ffmpegStatus } from "../../src/integrations/ffmpeg/probe.ts";

describe("cache + ffmpeg adapters", () => {
  it("cache helpers never throw when postgres is absent", async () => {
    if (postgresConfigured()) return;
    assert.equal(await cacheGet("missing"), undefined);
    await cacheSet("k", { ok: true }, 1000);
    assert.equal(await probeGet("ABCDEF"), undefined);
    await probeSet("ABCDEF", false);
  });

  it("cache round-trips a payload when postgres is configured", async () => {
    if (!postgresConfigured()) return;
    const key = `test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    await cacheSet(key, { teachers: ["pk"] }, 30_000);
    const hit = await cacheGet<{ teachers: string[] }>(key);
    assert.deepEqual(hit, { teachers: ["pk"] });
    await probeSet("TESTID1", true);
    const probe = await probeGet("TESTID1");
    assert.equal(probe?.archived, true);
  });

  it("ffmpeg status is ok or missing, never throws", () => {
    const status = ffmpegStatus();
    assert.ok(status === "ok" || status === "missing");
    if (status === "ok") assert.ok(ffmpegBinary());
    else assert.equal(ffmpegBinary(), null);
  });
});
