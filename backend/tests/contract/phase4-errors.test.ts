import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { testApp } from "../helpers/app.ts";

describe("phase 4 client errors", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await testApp();
    app.get("/api/phase4-boom", async () => {
      throw new Error("ECONNREFUSED /workspace/secret.pem");
    });
  });

  after(async () => {
    await app.close();
  });

  it("hides a thrown server error from the client", async () => {
    const res = await app.inject({ method: "GET", url: "/api/phase4-boom" });
    assert.equal(res.statusCode, 500);
    const body = res.json() as { error: string; code: string; requestId: string };
    assert.equal(body.error, "Something went wrong");
    assert.equal(body.code, "INTERNAL");
    assert.ok(body.requestId);
    assert.doesNotMatch(res.body, /secret|workspace|ECONN|stack/i);
  });

  it("rejects an unknown exam without a schema dump", async () => {
    const res = await app.inject({ method: "GET", url: "/api/exams/not-an-exam/hub" });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error: string };
    assert.equal(body.error, "Unknown exam");
    assert.doesNotMatch(res.body, /ZodError|issues|stack/i);
  });
});
