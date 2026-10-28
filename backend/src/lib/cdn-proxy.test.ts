import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import {
  GZIP_MAX_COMPRESSED,
  LruMap,
  NOTES_TITLE_MAX,
  allowRate,
  capTitle,
  contentDisposition,
  fetchAllowlisted,
  gunzipCapped,
  isHttpsCdn,
  isNotesUrl,
  isWebp,
  readCapped,
  resetProxyLimits,
  sanitizeFilename,
} from "@inkboard/shared/cdn-proxy";
import { installHostLookup } from "@inkboard/shared/ssrf";

afterEach(() => resetProxyLimits());

describe("cdn allowlist and hops", () => {
  it("refuses a redirect onto a private or metadata address even if the allow check is loose", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/start")) {
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
      }
      return new Response("should not land", { status: 200 });
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => fetchAllowlisted("https://player.uacdn.net/start", { allowed: () => true }),
        /Blocked address/,
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it("refuses a direct fetch of loopback", async () => {
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("no");
    }) as typeof fetch;
    try {
      await assert.rejects(() => fetchAllowlisted("http://127.0.0.1/secret", { allowed: () => true }), /Blocked address/);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("refuses a public name when DNS answers with a private address", async () => {
    const restore = installHostLookup(async () => ["127.0.0.1"]);
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("no");
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => fetchAllowlisted("https://player.uacdn.net/rebind", { allowed: () => true }),
        /Blocked address/,
      );
      assert.equal(called, false);
    } finally {
      globalThis.fetch = original;
      restore();
    }
  });

  it("follows a name whose DNS answer is a public address", async () => {
    const restore = installHostLookup(async () => ["151.101.1.1"]);
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
    try {
      const res = await fetchAllowlisted("https://player.uacdn.net/ok", { allowed: isHttpsCdn });
      assert.equal(await res.text(), "ok");
    } finally {
      globalThis.fetch = original;
      restore();
    }
  });

  it("rejects a redirect off the CDN before following it", async () => {
    const hops: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      hops.push(url);
      assert.equal(init?.redirect, "manual");
      if (url.includes("player.uacdn.net/start")) {
        return new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } });
      }
      return new Response("should not land", { status: 200 });
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => fetchAllowlisted("https://player.uacdn.net/start", { allowed: isHttpsCdn }),
        /Redirected off the CDN/,
      );
      assert.deepEqual(hops, ["https://player.uacdn.net/start"]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("re-validates every hop and caps at 3 redirects", async () => {
    let n = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      n += 1;
      const url = String(input);
      return new Response(null, {
        status: 302,
        headers: { location: `https://player.uacdn.net/hop-${n}?from=${encodeURIComponent(url)}` },
      });
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => fetchAllowlisted("https://player.uacdn.net/start", { allowed: isHttpsCdn, maxHops: 3 }),
        /Too many redirects/,
      );
      assert.equal(n, 4);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("follows an allowed hop then returns the body", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/a")) {
        return new Response(null, { status: 302, headers: { location: "https://uamedia.uacdn.net/b.webp" } });
      }
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    try {
      const res = await fetchAllowlisted("https://player.uacdn.net/a", { allowed: isHttpsCdn });
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "ok");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("size caps and magic", () => {
  it("readCapped aborts past the byte budget", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(80));
        controller.enqueue(new Uint8Array(80));
        controller.close();
      },
    });
    await assert.rejects(() => readCapped(new Response(stream), 100), /Too large/);
  });

  it("isWebp requires both RIFF and WEBP", () => {
    const riffOnly = new Uint8Array(12);
    riffOnly.set([0x52, 0x49, 0x46, 0x46]);
    assert.equal(isWebp(riffOnly), false);
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46]);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    assert.equal(isWebp(webp), true);
  });

  it("tightens notes URLs to dpp/slides_pdf/lesson-raw segments", () => {
    assert.equal(isNotesUrl(new URL("https://player.uacdn.net/slides_pdf/id/x_with_anno.pdf")), true);
    assert.equal(isNotesUrl(new URL("https://player.uacdn.net/dpp/sheet.pdf")), true);
    assert.equal(isNotesUrl(new URL("https://player.uacdn.net/lesson-raw/id/file.pdf")), true);
    assert.equal(isNotesUrl(new URL("https://player.uacdn.net/foo/dpp-notes.pdf")), false);
    assert.equal(isNotesUrl(new URL("https://player.uacdn.net/evil.pdf")), false);
    assert.equal(isNotesUrl(new URL("http://player.uacdn.net/dpp/x.pdf")), false);
  });

  it("caps gzip compressed size and round-trips a small payload", async () => {
    const big = new Uint8Array(GZIP_MAX_COMPRESSED + 1);
    await assert.rejects(() => gunzipCapped(big), /too large/i);
    const out = await gunzipCapped(gzipSync(Buffer.from('{"ok":true}')));
    assert.equal(out, '{"ok":true}');
  });
});

describe("proxy hygiene", () => {
  it("rate-limits per ip", () => {
    for (let i = 0; i < 60; i += 1) assert.equal(allowRate("1.1.1.1"), true);
    assert.equal(allowRate("1.1.1.1"), false);
    assert.equal(allowRate("2.2.2.2"), true);
  });

  it("sanitizes Content-Disposition and title", () => {
    assert.equal(sanitizeFilename('bad\r\nfile"name.pdf'), "badfilename.pdf");
    assert.match(contentDisposition("नोट्स.pdf", false), /filename\*=UTF-8''/);
    assert.ok(!contentDisposition('a\r\nb.pdf', true).includes("\r"));
    assert.equal(capTitle("x".repeat(400)).length, NOTES_TITLE_MAX);
  });

  it("LruMap evicts the oldest unused key", () => {
    const lru = new LruMap<number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.get("a");
    lru.set("c", 3);
    assert.equal(lru.has("b"), false);
    assert.equal(lru.get("a"), 1);
    assert.equal(lru.get("c"), 3);
  });
});
