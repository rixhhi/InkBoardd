import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";
import { compactEvents, rewriteSlideUrl, unproxySlideUrl, visibleStrokes } from "@inkboard/shared/dcn";
import { isGzipMagic, parseInkJson, remapSlideUrls } from "@inkboard/shared/bundle/load";

function ev(plugin: string, p_time: number, data: Record<string, unknown>) {
  return { plugin, p_time, data };
}

const RAW = [
  [
    ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
    ev("dcn", 500_000, { e: "sc", s: 1 }),
    ev("cw", 1_000_000, { id: 1, data: { e: "d", p: { x: 0.1, y: 0.1, oid: "ink" } } }),
    ev("cw", 1_200_000, { id: 1, data: { e: "u", p: { x: 0.2, y: 0.2 } } }),
  ],
];

describe("bundle roundtrip", () => {
  it("keeps visibleStrokes identical after gzip save → load", () => {
    const rawJson = JSON.stringify(RAW);
    const gz = gzipSync(rawJson);
    assert.equal(isGzipMagic(gz), true);
    const text = gunzipSync(gz).toString("utf8");
    const fromDisk = parseInkJson("LESSON", text);
    const live = compactEvents("LESSON", RAW);
    assert.deepEqual(visibleStrokes(fromDisk, 2000, "s0"), visibleStrokes(live, 2000, "s0"));
  });

  it("remaps proxied slide URLs onto blob URLs", () => {
    const tl = compactEvents("LESSON", RAW);
    const orig = unproxySlideUrl(tl.slides.find((s) => s.uid === "s0")?.url || "");
    assert.equal(orig, "https://static.uacdn.net/s0.pdf?page=1");
    const mapped = remapSlideUrls(tl, new Map([[orig, "blob:inkboard/s0"]]));
    assert.equal(mapped.slides.find((s) => s.uid === "s0")?.url, "blob:inkboard/s0");
    const missing = remapSlideUrls(tl, new Map());
    assert.equal(missing.slides.find((s) => s.uid === "s0")?.url, undefined);
    assert.equal(unproxySlideUrl(rewriteSlideUrl(orig)!), orig);
  });
});
