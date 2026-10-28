import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ApiError, apiJson, qs } from "./api-client.ts";

describe("api client", () => {
  const original = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = original;
  });

  it("drops empty query values", () => {
    assert.equal(qs({ a: "1", b: "", c: null, d: undefined, e: 0 }), "?a=1&e=0");
    assert.equal(qs({}), "");
  });

  it("throws ApiError with status and code from JSON", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Invalid lesson id", code: "BAD_REQUEST" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    await assert.rejects(
      () => apiJson("/api/lessons/x/timeline"),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 400);
        assert.equal(err.code, "BAD_REQUEST");
        assert.equal(err.message, "Invalid lesson id");
        return true;
      },
    );
  });

  it("treats 204 as null", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    assert.equal(await apiJson("/api/x"), null);
  });

  it("passes JSON bodies through on success", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    assert.deepEqual(await apiJson("/api/x"), { ok: true });
  });
});
