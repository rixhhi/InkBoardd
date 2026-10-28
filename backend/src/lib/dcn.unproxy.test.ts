import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewriteSlideUrl, unproxySlideUrl } from "@inkboard/shared/dcn";

describe("unproxySlideUrl", () => {
  it("round-trips rewriteSlideUrl back to the original uacdn URL", () => {
    const orig = "https://static.uacdn.net/s0.pdf?page=1";
    const proxied = rewriteSlideUrl(orig);
    assert.equal(proxied, `/api/slide?u=${encodeURIComponent(orig)}`);
    assert.equal(unproxySlideUrl(proxied!), orig);
  });

  it("returns a bare CDN URL unchanged", () => {
    const orig = "https://uadoc.uacdn.net/foo.jpg";
    assert.equal(unproxySlideUrl(orig), orig);
    assert.equal(unproxySlideUrl(""), "");
  });

  it("decodes a fully-qualified /api/slide URL", () => {
    const orig = "https://player.uacdn.net/slides/a.png?x=1";
    const wrapped = `https://inkboard.app/api/slide?u=${encodeURIComponent(orig)}`;
    assert.equal(unproxySlideUrl(wrapped), orig);
  });
});
