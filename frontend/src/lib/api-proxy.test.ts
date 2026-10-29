import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildProxyRequest, forwardResponse, PROXY_SECRET_HEADER, shouldProxyApi } from "./api-proxy.ts";

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

  it("drops content-encoding/length from the upstream reply: fetch already decoded the body (the 'Checking your sign-in' hang)", async () => {
    // What undici hands back after transparently decoding a brotli reply from the API.
    const upstream = new Response('{"ok":true}', {
      status: 401,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-encoding": "br",
        "content-length": "97",
        "set-cookie": "ib_session=abc; Path=/; HttpOnly",
        "x-request-id": "r1",
      },
    });
    const out = forwardResponse(upstream);
    assert.equal(out.status, 401);
    assert.equal(out.headers.get("content-encoding"), null, "browser must not be told the plaintext body is brotli");
    assert.equal(out.headers.get("content-length"), null);
    assert.equal(out.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(out.headers.get("x-request-id"), "r1");
    assert.match(out.headers.get("set-cookie") ?? "", /ib_session=abc/, "session cookie survives the rebuild");
    assert.equal(await out.text(), '{"ok":true}');
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
