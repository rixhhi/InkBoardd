import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { testApp } from "../helpers/app.ts";

describe("job contract", () => {
  let app: FastifyInstance;
  before(async () => {
    app = await testApp();
  });
  after(async () => {
    await app.close();
  });

  it("refuses a lecture job without a lesson id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/lectures",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().code, "BAD_REQUEST");
  });

  it("refuses a path-like lesson id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/lectures",
      headers: { "content-type": "application/json" },
      payload: { id: "../etc/passwd" },
    });
    assert.equal(res.statusCode, 400);
  });

  it("unknown job id is 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/jobs/missing" });
    assert.equal(res.statusCode, 404);
  });

  it("cancel unknown job is 404", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/jobs/missing" });
    assert.equal(res.statusCode, 404);
  });
});
