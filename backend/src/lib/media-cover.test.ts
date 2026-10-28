import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bannerUrl, isEducatorAvatar, posterTone, rasterThumbUrl, slidePosterUrl, studioAvatar } from "@inkboard/shared/media-cover";

describe("slide poster url", () => {
  it("proxies the first page of a uacdn slides pdf", () => {
    const href = slidePosterUrl("https://player.uacdn.net/slides_pdf/ABC/Class_no_anno.pdf");
    assert.match(href, /^\/api\/slide\?u=/);
    assert.match(href, /page%3D1/);
  });

  it("keeps an existing page query", () => {
    const href = slidePosterUrl("https://static.uacdn.net/x.pdf?page=3");
    assert.ok(href.includes("page%3D3"));
    assert.ok(!href.includes("page%3D1"));
  });

  it("ignores empty and off-cdn urls", () => {
    assert.equal(slidePosterUrl(""), "");
    assert.equal(slidePosterUrl("https://example.com/x.pdf"), "");
  });
});

describe("raster thumbs", () => {
  it("keeps a real jpeg on uacdn and rejects pdfs and the slide proxy", () => {
    assert.equal(
      rasterThumbUrl("https://static.uacdn.net/webstatic/course/toc.png"),
      "https://static.uacdn.net/webstatic/course/toc.png",
    );
    assert.equal(rasterThumbUrl("https://player.uacdn.net/slides_pdf/ABC/Class.pdf?page=1"), "");
    assert.equal(rasterThumbUrl("/api/slide?u=https://static.uacdn.net/x.pdf"), "");
    assert.equal(rasterThumbUrl("https://example.com/x.png"), "");
  });

  it("colors poster fallbacks by lesson status", () => {
    assert.match(posterTone("live"), /danger/);
    assert.match(posterTone("upcoming"), /warn/);
    assert.match(posterTone("archived"), /faint/);
  });
});

describe("banner vs avatar", () => {
  it("keeps a real course cover", () => {
    const cover = "https://static.uacdn.net/webstatic/course/toc.png";
    assert.equal(bannerUrl(cover, "https://static.uacdn.net/thumbnail/user/a.png"), cover);
  });

  it("drops a cover that is just the teacher face", () => {
    const face = "https://static.uacdn.net/thumbnail/user/agsir.png";
    assert.equal(bannerUrl(face, face), "");
    assert.equal(bannerUrl(face), "");
    assert.ok(isEducatorAvatar(face));
  });

  it("drops educator_new processed thumbnails", () => {
    const face = "https://static.uacdn.net/educator_new/processed_thumbnail/ABC.png";
    assert.equal(bannerUrl(face, "other"), "");
  });

  it("treats empty as no banner", () => {
    assert.equal(bannerUrl(""), "");
    assert.equal(bannerUrl(null, "https://static.uacdn.net/x.png"), "");
  });
});

describe("studio avatar", () => {
  it("prefers the processed studio png over a jpeg headshot", () => {
    const jpg = "https://edge.uacdn.net/static/thumbnail/user/abc.jpg?q=100&w=512";
    const png = "https://static.uacdn.net/educator_new/processed_image/D39AA4E0-E970-44D2-BBE9-95A9CC5F25A5_.png";
    assert.equal(studioAvatar(jpg, png), png);
    assert.equal(studioAvatar(png, jpg), png);
    assert.equal(studioAvatar(jpg), jpg);
    assert.equal(studioAvatar("", null, png), png);
    assert.equal(studioAvatar(), "");
  });
});
