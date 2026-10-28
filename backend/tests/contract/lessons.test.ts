import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { testApp } from "../helpers/app.ts";

describe("lesson contract", () => {
  let app: FastifyInstance;
  before(async () => {
    app = await testApp();
  });
  after(async () => {
    await app.close();
  });

  it("timeline rejects an invalid id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/lessons/nope/timeline" });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { code: string; error: string };
    assert.equal(body.code, "BAD_REQUEST");
    assert.match(body.error, /invalid lesson id/i);
  });

  it("notes lookup rejects an invalid id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/lessons/%3Cscript%3E/notes" });
    assert.equal(res.statusCode, 400);
  });

  it("probe accepts only well-formed ids and ignores junk", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/lessons/probe",
      headers: { "content-type": "application/json" },
      payload: { ids: ["bad", "", 1, "nope", "../x"] },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, { archived: boolean }>;
    assert.equal(Object.keys(body).length, 0);
  });

  it("probe with no body is an empty map", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/lessons/probe",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {});
  });
});
