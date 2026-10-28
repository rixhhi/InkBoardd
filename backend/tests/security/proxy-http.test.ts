import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetProxyLimits } from "@inkboard/shared/cdn-proxy";
import { handleLiveSlide } from "../../src/routes/http/live-slide.ts";
import { handleNotes } from "../../src/routes/http/notes.ts";
import { handleSlide } from "../../src/routes/http/slide.ts";

afterEach(() => resetProxyLimits());

describe("proxy HTTP surface", () => {
  it("slide without u is 400", async () => {
    const res = await handleSlide(new Request("http://local/api/slide"));
    assert.equal(res.status, 400);
  });

  it("slide rejects a non-CDN host", async () => {
    const res = await handleSlide(
      new Request(`http://local/api/slide?u=${encodeURIComponent("https://evil.example/pwn.jpg")}`),
    );
    assert.equal(res.status, 400);
    assert.match(await res.text(), /host not allowed/i);
  });

  it("slide rejects http:// on the CDN", async () => {
    const res = await handleSlide(
      new Request(`http://local/api/slide?u=${encodeURIComponent("http://player.uacdn.net/x.jpg")}`),
    );
    assert.equal(res.status, 400);
  });

  it("slide does not double-decode a crafted u", async () => {
    const inner = encodeURIComponent("https://evil.example/x");
    const res = await handleSlide(new Request(`http://local/api/slide?u=${inner}`));
    assert.equal(res.status, 400);
  });

  it("notes without a target is 400", async () => {
    const res = await handleNotes(new Request("http://local/api/notes"));
    assert.equal(res.status, 400);
  });

  it("notes reject a PDF on a foreign host", async () => {
    const res = await handleNotes(
      new Request(`http://local/api/notes?u=${encodeURIComponent("https://evil.example/dpp/x.pdf")}`),
    );
    assert.equal(res.status, 400);
  });

  it("live-slide without uid is 400", async () => {
    const res = await handleLiveSlide(new Request("http://local/api/live-slide"));
    assert.equal(res.status, 400);
  });
});
