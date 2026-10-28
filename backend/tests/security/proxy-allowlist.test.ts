import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isHttpsCdn,
  isNotesUrl,
  isSlideUrl,
  isUnacademyHost,
  sanitizeFilename,
  capTitle,
  contentDisposition,
  isJpeg,
  isPng,
  isWebp,
  isPdfMagic,
  isGzip,
  NOTES_TITLE_MAX,
} from "@inkboard/shared/cdn-proxy";

describe("proxy allowlist", () => {
  it("only allows HTTPS uacdn hosts", () => {
    assert.equal(isHttpsCdn(new URL("https://player.uacdn.net/x.jpg")), true);
    assert.equal(isHttpsCdn(new URL("https://static.uacdn.net/x.jpg")), true);
    assert.equal(isHttpsCdn(new URL("http://player.uacdn.net/x.jpg")), false);
    assert.equal(isHttpsCdn(new URL("https://evil.com/x.jpg")), false);
    assert.equal(isHttpsCdn(new URL("https://uacdn.net.evil.com/x.jpg")), false);
    assert.equal(isHttpsCdn(new URL("https://unacademy.com/x.jpg")), false);
  });

  it("slides stay on the CDN", () => {
    assert.equal(isSlideUrl(new URL("https://player.uacdn.net/slide.jpg")), true);
    assert.equal(isSlideUrl(new URL("https://example.com/slide.jpg")), false);
    assert.equal(isSlideUrl(new URL("https://unacademy.com/slide.jpg")), false);
  });

  it("notes must be a PDF under dpp / slides_pdf / lesson-raw", () => {
    assert.equal(isNotesUrl(new URL("https://player.uacdn.net/slides_pdf/abc/notes.pdf")), true);
    assert.equal(isNotesUrl(new URL("https://player.uacdn.net/dpp/abc/x.pdf")), true);
    assert.equal(isNotesUrl(new URL("https://player.uacdn.net/lesson-raw/abc/x.pdf")), true);
    assert.equal(isNotesUrl(new URL("https://player.uacdn.net/slides_pdf/abc/x.png")), false);
    assert.equal(isNotesUrl(new URL("https://player.uacdn.net/other/abc/x.pdf")), false);
    assert.equal(isNotesUrl(new URL("https://evil.com/dpp/x.pdf")), false);
  });

  it("Unacademy hosts are the documented set", () => {
    assert.equal(isUnacademyHost(new URL("https://unacademy.com/api")), true);
    assert.equal(isUnacademyHost(new URL("https://api.unacademy.com/x")), true);
    assert.equal(isUnacademyHost(new URL("https://player.uacdn.net/x")), true);
    assert.equal(isUnacademyHost(new URL("https://attacker.unacademy.com.evil.com/x")), false);
    assert.equal(isUnacademyHost(new URL("http://unacademy.com/x")), false);
  });

  it("filenames cannot escape the download folder", () => {
    assert.equal(sanitizeFilename("../etc/passwd"), "passwd.pdf");
    assert.ok(!sanitizeFilename("a/b\\c").includes("/"));
    assert.ok(!sanitizeFilename("a/b\\c").includes("\\"));
    assert.ok(!sanitizeFilename("notes.pdf").includes("/"));
  });

  it("titles are capped so Content-Disposition cannot balloon", () => {
    const long = "n".repeat(NOTES_TITLE_MAX + 80);
    assert.ok(capTitle(long).length <= NOTES_TITLE_MAX);
  });

  it("Content-Disposition quotes the name", () => {
    const header = contentDisposition("class notes.pdf");
    assert.match(header, /attachment/);
    assert.match(header, /filename=/);
  });

  it("magic bytes distinguish raster, pdf, gzip from HTML", () => {
    assert.equal(isJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), true);
    assert.equal(isPng(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
    assert.equal(
      isWebp(
        Uint8Array.from([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
      true,
    );
    assert.equal(isPdfMagic(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])), true);
    assert.equal(isGzip(Uint8Array.from([0x1f, 0x8b, 0x08])), true);
    const html = new TextEncoder().encode("<!doctype html>");
    assert.equal(isJpeg(html), false);
    assert.equal(isPdfMagic(html), false);
    assert.equal(isGzip(html), false);
  });
});
