import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { testApp } from "../helpers/app.ts";

describe("catalog contract", () => {
  let app: FastifyInstance;
  before(async () => {
    app = await testApp();
  });
  after(async () => {
    await app.close();
  });

  it("lists exams without hitting Unacademy", async () => {
    const res = await app.inject({ method: "GET", url: "/api/exams" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { exams: Array<{ id: string; name: string }> };
    assert.ok(Array.isArray(body.exams));
    assert.ok(body.exams.length >= 8);
    assert.ok(body.exams.every((e) => e.id && e.name));
    assert.ok(body.exams.some((e) => e.id === "YOTUH" || e.name.includes("NEET") || e.name.includes("JEE")));
  });

  it("rejects an unknown exam id with 400, not a 502 banner", async () => {
    const res = await app.inject({ method: "GET", url: "/api/exams/not-an-exam/hub" });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error: string; code: string };
    assert.equal(body.code, "BAD_REQUEST");
    assert.match(body.error, /unknown exam/i);
  });

  it("rejects a short teacher search", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search/educators?q=a" });
    assert.equal(res.statusCode, 400);
  });

  it("search desk with one character returns empty teachers, not 500", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search/desk?q=x" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { teachers: unknown[] };
    assert.deepEqual(body.teachers, []);
  });

  it("rejects a malformed course id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/courses/!!" });
    assert.equal(res.statusCode, 400);
  });

  it("rejects a malformed class id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/classes/xx" });
    assert.equal(res.statusCode, 400);
  });
});
