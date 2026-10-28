import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import middleware from "../middleware.ts";

describe("vercel deep links", () => {
  it("does not rewrite routes; middleware is the only API proxy", () => {
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
      rewrites?: unknown;
      headers?: unknown[];
    };
    const blob = JSON.stringify(vercel);
    assert.equal(vercel.rewrites, undefined);
    assert.doesNotMatch(blob, /index\.html/);
    assert.doesNotMatch(blob, /onrender\.com/);
    assert.ok(Array.isArray(vercel.headers) && vercel.headers.length > 0);
    const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
    assert.match(source, /INKBOARD_API_ORIGIN/);
    assert.doesNotMatch(source, /fetch\(request\)/);
    assert.doesNotMatch(source, /onrender\.com/);
  });

  it("returns nothing for a page and 500 JSON when the API origin is unset", async () => {
    const previousOrigin = process.env.INKBOARD_API_ORIGIN;
    const previousNode = process.env.NODE_ENV;
    delete process.env.INKBOARD_API_ORIGIN;
    process.env.NODE_ENV = "production";
    try {
      const page = await middleware(new Request("https://inkboard.example/play/YOTUH123"));
      assert.equal(page, undefined);
      const blocked = await middleware(new Request("https://inkboard.example/api/jobs/lectures"));
      assert.ok(blocked instanceof Response);
      assert.equal(blocked.status, 500);
      const body = (await blocked.json()) as { code?: string; error?: string };
      assert.equal(body.code, "MISCONFIGURED");
      assert.match(body.error ?? "", /INKBOARD_API_ORIGIN/);
      assert.doesNotMatch(JSON.stringify(body), /onrender\.com|127\.0\.0\.1/);
    } finally {
      if (previousOrigin === undefined) delete process.env.INKBOARD_API_ORIGIN;
      else process.env.INKBOARD_API_ORIGIN = previousOrigin;
      if (previousNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNode;
    }
  });
});
