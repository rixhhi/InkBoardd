import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { allowRate as memoryAllow, resetProxyLimits } from "@inkboard/shared/cdn-proxy";
import { buildApp } from "../../src/app.ts";
import { allowRate, rateConfig } from "../../src/middlewares/rate-limit.ts";
import { rememberJob } from "../../src/routes/jobs.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.AUTH_DISABLED ??= "1";

describe("rate limit", () => {
  after(() => {
    delete process.env.RATE_LIMIT;
    delete process.env.RATE_WINDOW_MS;
    resetProxyLimits();
  });

  it("memory limiter trips after N hits from one ip", () => {
    resetProxyLimits();
    const ip = "198.51.100.7";
    for (let i = 0; i < 8; i++) assert.equal(memoryAllow(ip, 8, 60_000), true);
    assert.equal(memoryAllow(ip, 8, 60_000), false);
    resetProxyLimits();
    assert.equal(memoryAllow(ip, 8, 60_000), true);
    resetProxyLimits();
  });

  it("allowRate falls back to memory when redis is down or absent", async () => {
    resetProxyLimits();
    const ip = `test-${Date.now()}`;
    const first = await allowRate(ip, 3, 60_000);
    const second = await allowRate(ip, 3, 60_000);
    const third = await allowRate(ip, 3, 60_000);
    const fourth = await allowRate(ip, 3, 60_000);
    assert.equal(first, true);
    assert.equal(second, true);
    assert.equal(third, true);
    assert.equal(fourth, false);
    resetProxyLimits();
  });

  it("RATE_LIMIT and RATE_WINDOW_MS are the configured cap", () => {
    process.env.RATE_LIMIT = "4";
    process.env.RATE_WINDOW_MS = "5000";
    assert.deepEqual(rateConfig(), { limit: 4, windowMs: 5000 });
    process.env.RATE_LIMIT = "0";
    process.env.RATE_WINDOW_MS = "10";
    assert.deepEqual(rateConfig(), { limit: 120, windowMs: 60_000 });
    delete process.env.RATE_LIMIT;
    delete process.env.RATE_WINDOW_MS;
  });

  it("the api cap returns 429 after the configured number of hits", async () => {
    resetProxyLimits();
    process.env.RATE_LIMIT = "2";
    process.env.RATE_WINDOW_MS = "60000";
    const app = await buildApp();
    try {
      const headers = { "x-forwarded-for": `phase1-${Date.now()}` };
      const first = await app.inject({ method: "GET", url: "/api/exams", headers });
      const second = await app.inject({ method: "GET", url: "/api/exams", headers });
      const third = await app.inject({ method: "GET", url: "/api/exams", headers });
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      assert.equal(third.statusCode, 429);
      assert.equal(third.json().code, "RATE_LIMIT");
    } finally {
      delete process.env.RATE_LIMIT;
      delete process.env.RATE_WINDOW_MS;
      await app.close();
      resetProxyLimits();
    }
  });

  it("polls of a job are generous and only lecture creates use the 30/min bucket", async () => {
    resetProxyLimits();
    const previousLimit = process.env.RATE_LIMIT;
    const previousWindow = process.env.RATE_WINDOW_MS;
    const previousTrust = process.env.TRUST_PROXY;
    process.env.RATE_LIMIT = "100";
    process.env.RATE_WINDOW_MS = "60000";
    process.env.TRUST_PROXY = "1";
    const app = await buildApp();
    const ip = "203.0.113.44";
    const headers = { "x-forwarded-for": ip };
    try {
      const dir = mkdtempSync(join(tmpdir(), "ink-poll-"));
      rememberJob({
        id: "poll-job",
        kind: "lecture",
        state: "running",
        pct: 10,
        step: "saving",
        outDir: dir,
        payload: {},
        abort: new AbortController(),
      });
      for (let i = 0; i < 40; i += 1) {
        const res = await app.inject({ method: "GET", url: "/api/jobs/poll-job", headers });
        assert.equal(res.statusCode, 200, `poll ${i}`);
      }
      let last = 0;
      for (let i = 0; i < 31; i += 1) {
        const res = await app.inject({
          method: "POST",
          url: "/api/jobs/lectures",
          headers: { ...headers, "content-type": "application/json" },
          payload: {},
        });
        last = res.statusCode;
        if (i < 30) assert.notEqual(res.statusCode, 429, `create ${i}`);
      }
      assert.equal(last, 429);
    } finally {
      if (previousLimit === undefined) delete process.env.RATE_LIMIT;
      else process.env.RATE_LIMIT = previousLimit;
      if (previousWindow === undefined) delete process.env.RATE_WINDOW_MS;
      else process.env.RATE_WINDOW_MS = previousWindow;
      if (previousTrust === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = previousTrust;
      await app.close();
      resetProxyLimits();
    }
  });
});
