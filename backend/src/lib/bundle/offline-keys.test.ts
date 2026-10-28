import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { offlineHotkey } from "@inkboard/shared/bundle/offline-keys";

const key = (partial: Partial<{ key: string; code: string; metaKey: boolean; ctrlKey: boolean }>) => ({
  key: "k",
  code: "KeyK",
  ...partial,
});

describe("offlineHotkey", () => {
  it("maps space/k, arrows 5s, j/l 10s", () => {
    assert.deepEqual(offlineHotkey(key({ key: " ", code: "Space" }), null), { type: "togglePlay", preventDefault: true });
    assert.deepEqual(offlineHotkey(key({ key: "k", code: "KeyK" }), null), { type: "togglePlay", preventDefault: true });
    assert.deepEqual(offlineHotkey(key({ key: "ArrowRight", code: "ArrowRight" }), null), { type: "seekBy", seconds: 5 });
    assert.deepEqual(offlineHotkey(key({ key: "ArrowLeft", code: "ArrowLeft" }), null), { type: "seekBy", seconds: -5 });
    assert.deepEqual(offlineHotkey(key({ key: "l", code: "KeyL" }), null), { type: "seekBy", seconds: 10 });
    assert.deepEqual(offlineHotkey(key({ key: "j", code: "KeyJ" }), null), { type: "seekBy", seconds: -10 });
    assert.deepEqual(offlineHotkey(key({ key: "c", code: "KeyC" }), null), { type: "toggleCam" });
    assert.deepEqual(offlineHotkey(key({ key: "f", code: "KeyF" }), null), { type: "fullscreen" });
    assert.deepEqual(offlineHotkey(key({ key: "m", code: "KeyM" }), null), { type: "toggleMute" });
    assert.deepEqual(offlineHotkey(key({ key: "[", code: "BracketLeft" }), null), { type: "speed", dir: -1 });
    assert.equal(offlineHotkey(key({ key: "n", code: "KeyN" }), null), null);
    assert.deepEqual(offlineHotkey(key({ key: "n", code: "KeyN" }), null, { hasNext: true }), { type: "next" });
    assert.deepEqual(offlineHotkey(key({ key: "p", code: "KeyP" }), null, { hasPrev: true }), { type: "prev" });
  });

  it("ignores typing and chords", () => {
    assert.equal(offlineHotkey(key({ key: "k", metaKey: true }), null), null);
    assert.equal(offlineHotkey(key({ key: "k" }), { tagName: "INPUT", type: "text" }), null);
  });
});
