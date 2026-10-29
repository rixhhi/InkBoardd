import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { upstream } from "../src/lib/server/api-upstream.ts";

describe("vercel deep links", () => {
  it("does not rewrite routes; the server routes are the only API proxy", () => {
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
      rewrites?: unknown;
      headers?: unknown[];
      outputDirectory?: string;
    };
    const blob = JSON.stringify(vercel);
    assert.equal(vercel.rewrites, undefined);
    assert.doesNotMatch(blob, /index\.html/);
    assert.doesNotMatch(blob, /onrender\.com/);
    assert.ok(Array.isArray(vercel.headers) && vercel.headers.length > 0);
    assert.equal(vercel.outputDirectory, ".vercel/output", "Nitro's vercel preset writes the Build Output API folder");
    const source = readFileSync(new URL("../src/lib/server/api-upstream.ts", import.meta.url), "utf8");
    assert.match(source, /INKBOARD_API_ORIGIN/);
    assert.doesNotMatch(source, /fetch\(request\)/, "goes through buildProxyRequest so the secret is stamped");
    assert.doesNotMatch(source, /onrender\.com/);
    for (const file of ["api.$.tsx", "healthz.tsx", "readyz.tsx"]) {
      const route = readFileSync(new URL(`../src/routes/${file}`, import.meta.url), "utf8");
      assert.match(route, /server:\s*\{\s*handlers:\s*\{\s*ANY:/, `${file} is a server-only route`);
      assert.doesNotMatch(route, /component:/, `${file} renders no page`);
    }
  });

  it("answers 500 JSON when the API origin is unset, without leaking a host", async () => {
    const previousOrigin = process.env.INKBOARD_API_ORIGIN;
    delete process.env.INKBOARD_API_ORIGIN;
    try {
      const blocked = await upstream(new Request("https://inkboard.example/api/jobs/lectures"));
      assert.equal(blocked.status, 500);
      const body = (await blocked.json()) as { code?: string; error?: string };
      assert.equal(body.code, "MISCONFIGURED");
      assert.match(body.error ?? "", /INKBOARD_API_ORIGIN/);
      assert.doesNotMatch(JSON.stringify(body), /onrender\.com|127\.0\.0\.1/);
    } finally {
      if (previousOrigin === undefined) delete process.env.INKBOARD_API_ORIGIN;
      else process.env.INKBOARD_API_ORIGIN = previousOrigin;
    }
  });
});
