import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { testApp } from "../helpers/app.ts";
import { beginShutdown, resetShutdown } from "../../src/lifecycle.ts";
import { readinessProbes } from "../../src/routes/health.ts";

describe("health contract", () => {
  let app: FastifyInstance;
  before(async () => {
    app = await testApp();
  });
  after(async () => {
    await app.close();
  });

  it("GET /healthz is liveness only", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, "inkboard-api");
  });

  it("GET /readyz reports postgres, redis, ffmpeg without crashing when stores are absent", async () => {
    const res = await app.inject({ method: "GET", url: "/readyz" });
    assert.ok(res.statusCode === 200 || res.statusCode === 503);
    const body = res.json() as { postgres: string; redis: string; ffmpeg: string };
    assert.ok(["ok", "skip", "error"].includes(body.postgres));
    assert.ok(["ok", "skip", "error"].includes(body.redis));
    assert.ok(["ok", "missing"].includes(body.ffmpeg));
  });

  it("rejects a body over 1 MB without echoing it back", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/study/summary",
      headers: { "content-type": "application/json" },
      payload: "x".repeat(1_048_577),
    });
    assert.equal(res.statusCode, 413);
    assert.equal(res.json().error, "Request body is too large");
    assert.equal(String(res.body).includes("x".repeat(80)), false);
  });

  it("sends a locked-down content security policy and no-referrer", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    const csp = String(res.headers["content-security-policy"] || "");
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers["referrer-policy"], "no-referrer");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });

  it("stamps a request id on every response", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz", headers: { "x-request-id": "desk-qa-1" } });
    assert.equal(res.headers["x-request-id"], "desk-qa-1");
  });

  it("unknown routes 404 as JSON, not HTML", async () => {
    const res = await app.inject({ method: "GET", url: "/api/does-not-exist" });
    assert.equal(res.statusCode, 404);
    assert.match(String(res.headers["content-type"] || ""), /json/i);
  });

  it("readyz is 503 while the process is shutting down", async () => {
    beginShutdown();
    try {
      const res = await app.inject({ method: "GET", url: "/readyz" });
      assert.equal(res.statusCode, 503);
      assert.equal(res.json().shuttingDown, true);
    } finally {
      resetShutdown();
    }
  });

  it("returns 200 with redis error when postgres is fine", async () => {
    const prevPg = readinessProbes.postgres;
    const prevRedis = readinessProbes.redis;
    readinessProbes.postgres = async () => "ok";
    readinessProbes.redis = async () => "error";
    try {
      const res = await app.inject({ method: "GET", url: "/readyz" });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { postgres: string; redis: string };
      assert.equal(body.postgres, "ok");
      assert.equal(body.redis, "error");
    } finally {
      readinessProbes.postgres = prevPg;
      readinessProbes.redis = prevRedis;
    }
  });

  it("returns 503 when postgres errors even if redis is fine", async () => {
    const prevPg = readinessProbes.postgres;
    const prevRedis = readinessProbes.redis;
    readinessProbes.postgres = async () => "error";
    readinessProbes.redis = async () => "ok";
    try {
      const res = await app.inject({ method: "GET", url: "/readyz" });
      assert.equal(res.statusCode, 503);
      assert.equal(res.json().postgres, "error");
      assert.equal(res.json().redis, "ok");
    } finally {
      readinessProbes.postgres = prevPg;
      readinessProbes.redis = prevRedis;
    }
  });
});
