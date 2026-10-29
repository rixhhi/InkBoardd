import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildProxyRequest, PROXY_SECRET_HEADER, shouldProxyApi } from "./api-proxy.ts";

describe("Vercel API proxy", () => {
  it("proxies API and health paths only", () => {
    assert.equal(shouldProxyApi("/api/jobs/lectures"), true);
    assert.equal(shouldProxyApi("/api"), true);
    assert.equal(shouldProxyApi("/healthz"), true);
    assert.equal(shouldProxyApi("/readyz"), true);
    assert.equal(shouldProxyApi("/play/abc"), false);
  });

  it("stamps the proxy secret and drops one supplied by the browser", () => {
    const req = new Request("https://inkboard.example/api/jobs/lectures?x=1", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [PROXY_SECRET_HEADER]: "from-browser",
        "x-forwarded-for": "203.0.113.10",
      },
      body: "{}",
    });
    const proxied = buildProxyRequest(req, "https://kalamboard.onrender.com", "real-secret");
    assert.equal(proxied.url, "https://kalamboard.onrender.com/api/jobs/lectures?x=1");
    assert.equal(proxied.method, "POST");
    assert.equal(proxied.headers.get(PROXY_SECRET_HEADER), "real-secret");
    assert.equal(proxied.headers.get("x-forwarded-for"), "203.0.113.10");

    const open = buildProxyRequest(
      new Request("https://inkboard.example/healthz", { headers: { [PROXY_SECRET_HEADER]: "from-browser" } }),
      "https://kalamboard.onrender.com/",
      undefined,
    );
    assert.equal(open.headers.get(PROXY_SECRET_HEADER), null);
    assert.equal(new URL(open.url).pathname, "/healthz");
  });

  it("the server-side upstream reads INKBOARD_PROXY_SECRET and the build does not set BUDGET_STRICT", () => {
    const upstream = readFileSync(new URL("./server/api-upstream.ts", import.meta.url), "utf8");
    assert.match(upstream, /INKBOARD_PROXY_SECRET/);
    assert.match(upstream, /proxyApi\(/);
    const vercel = readFileSync(new URL("../../vercel.json", import.meta.url), "utf8");
    assert.doesNotMatch(vercel, /BUDGET_STRICT/);
    assert.doesNotMatch(vercel, /INKBOARD_PROXY_SECRET/);
  });
});
