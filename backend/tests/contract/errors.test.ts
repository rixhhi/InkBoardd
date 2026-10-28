import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { jsonError, publicError, statusForMessage } from "../../src/http.ts";
import { HttpError } from "@inkboard/shared/http-error";
import { testApp } from "../helpers/app.ts";

describe("error contract", () => {
  let app: FastifyInstance;
  before(async () => {
    app = await testApp();
  });
  after(async () => {
    await app.close();
  });

  it("maps known client copy onto 400/410 and hides internal failures", () => {
    assert.deepEqual(statusForMessage("Unknown exam"), { status: 400, code: "BAD_REQUEST" });
    assert.deepEqual(statusForMessage("Invalid lesson id"), { status: 400, code: "BAD_REQUEST" });
    assert.deepEqual(statusForMessage("Type at least 2 characters"), { status: 400, code: "BAD_REQUEST" });
    assert.deepEqual(statusForMessage("ARCHIVED: cold storage"), { status: 410, code: "ARCHIVED" });
    const leaked = publicError(new Error("password=secret at /workspace/backend/secret.ts"));
    assert.equal(leaked.status, 500);
    assert.equal(leaked.error, "Something went wrong");
    assert.equal(leaked.log, true);
    const typed = publicError(new HttpError(400, "BAD_REQUEST", "Unknown exam"));
    assert.equal(typed.error, "Unknown exam");
    const hidden = publicError(new HttpError(500, "INTERNAL", "disk at /workspace/secret"));
    assert.equal(hidden.status, 500);
    assert.equal(hidden.error, "Something went wrong");
    const noisy = publicError(new Error("This door did not open at /workspace/secret.ts"));
    assert.equal(noisy.status, 500);
    assert.equal(noisy.error, "Something went wrong");
    assert.equal(noisy.log, true);
  });

  it("jsonError always carries code + error", () => {
    const body = jsonError(400, "Invalid class id", "BAD_REQUEST", "rid");
    assert.deepEqual(body, { error: "Invalid class id", code: "BAD_REQUEST", requestId: "rid" });
  });

  it("GET /api/upstream/health is JSON even with no fail recorded", async () => {
    const res = await app.inject({ method: "GET", url: "/api/upstream/health" });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"] || ""), /json/i);
  });

  it("allows the preview origin and rejects any other origin", async () => {
    const ok = await app.inject({
      method: "OPTIONS",
      url: "/api/exams",
      headers: { origin: "http://127.0.0.1:8080", "access-control-request-method": "GET" },
    });
    assert.ok(ok.statusCode === 200 || ok.statusCode === 204);
    assert.equal(ok.headers["access-control-allow-origin"], "http://127.0.0.1:8080");

    const blocked = await app.inject({
      method: "GET",
      url: "/api/exams",
      headers: { origin: "https://evil.example" },
    });
    assert.notEqual(blocked.headers["access-control-allow-origin"], "https://evil.example");
  });
});
