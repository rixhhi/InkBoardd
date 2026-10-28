import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { testApp } from "../helpers/app.ts";

describe("HTTP surface", () => {
  let app: FastifyInstance;
  before(async () => {
    app = await testApp();
  });
  after(async () => {
    await app.close();
  });

  it("exposes the catalog, jobs, and health routes used by the desk", async () => {
    const exams = await app.inject({ method: "GET", url: "/api/exams" });
    assert.equal(exams.statusCode, 200);
    const health = await app.inject({ method: "GET", url: "/healthz" });
    assert.equal(health.statusCode, 200);
    const ready = await app.inject({ method: "GET", url: "/readyz" });
    assert.ok(ready.statusCode === 200 || ready.statusCode === 503);
    const jobs = await app.inject({ method: "GET", url: "/api/jobs/missing" });
    assert.equal(jobs.statusCode, 404);
    const upstream = await app.inject({ method: "GET", url: "/api/upstream/health" });
    assert.equal(upstream.statusCode, 200);
  });

  it("JSON routes never return HTML error pages", async () => {
    for (const url of ["/api/exams/nope/hub", "/api/lessons/nope/timeline", "/api/search/educators?q=x", "/nope"]) {
      const res = await app.inject({ method: "GET", url });
      assert.match(String(res.headers["content-type"] || ""), /json/i, url);
      assert.ok(res.statusCode >= 400, url);
      const body = res.json() as { error?: string; code?: string };
      assert.equal(typeof body.error, "string", url);
      assert.equal(typeof body.code, "string", url);
    }
  });
});
