import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canPictureInPicture, choosePlaybackSource, lockPitch, mediaErrorMessage, otherTabStarted, shouldReapplyRate, togglePictureInPicture } from "./engine.ts";

describe("playback source", () => {
  it("prefers native HLS, then hls.js, then the file, then audio", () => {
    assert.deepEqual(
      choosePlaybackSource({
        hlsUrl: "a.m3u8",
        fileUrl: "a.mp4",
        audioUrl: "a.m4a",
        listen: false,
        canPlayNativeHls: true,
        hlsJsSupported: true,
      }),
      { kind: "native-hls", url: "a.m3u8" },
    );
    assert.equal(
      choosePlaybackSource({
        hlsUrl: "a.m3u8",
        listen: false,
        canPlayNativeHls: false,
        hlsJsSupported: true,
      })?.kind,
      "hls.js",
    );
    assert.deepEqual(
      choosePlaybackSource({
        hlsUrl: "a.m3u8",
        fileUrl: "a.mp4",
        listen: false,
        canPlayNativeHls: false,
        hlsJsSupported: false,
      }),
      { kind: "file", url: "a.mp4" },
    );
    assert.equal(
      choosePlaybackSource({
        hlsUrl: "a.m3u8",
        audioUrl: "a.m4a",
        listen: true,
        canPlayNativeHls: true,
        hlsJsSupported: true,
      })?.kind,
      "audio",
    );
    assert.equal(
      choosePlaybackSource({ listen: false, canPlayNativeHls: false, hlsJsSupported: false }),
      null,
    );
  });

  it("names decode and network failures, and stays generic otherwise", () => {
    assert.equal(mediaErrorMessage(2), "The network dropped. Try again.");
    assert.equal(mediaErrorMessage(3), "This file could not be decoded.");
    assert.equal(mediaErrorMessage(4), "This browser cannot play this file.");
    assert.equal(mediaErrorMessage(null), "Something went wrong");
    assert.equal(mediaErrorMessage(9), "Something went wrong");
  });

  it("locks pitch before applying the rate", () => {
    const video = { playbackRate: 1, preservesPitch: false };
    lockPitch(video, 1.5);
    assert.equal(video.preservesPitch, true);
    assert.equal(video.playbackRate, 1.5);
  });

  it("reapplies a chosen speed after the next lecture resets the element to 1x", () => {
    assert.equal(shouldReapplyRate(2, 1), true);
    assert.equal(shouldReapplyRate(1, 1), false);
    assert.equal(shouldReapplyRate(2, 2), false);
  });

  it("pauses this tab only when a different tab starts playback", () => {
    assert.equal(otherTabStarted({ type: "inkboard-play", id: "b" }, "a"), true);
    assert.equal(otherTabStarted({ type: "inkboard-play", id: "a" }, "a"), false);
    assert.equal(otherTabStarted({ type: "pause", id: "b" }, "a"), false);
    assert.equal(otherTabStarted(null, "a"), false);
  });

  it("toggles picture-in-picture without assuming the browser has it", async () => {
    let calls = 0;
    const video = { requestPictureInPicture: async () => { calls += 1; } };
    const doc = { pictureInPictureEnabled: true, pictureInPictureElement: null as unknown, exitPictureInPicture: async () => {} };
    assert.equal(canPictureInPicture(video, doc), true);
    assert.equal(await togglePictureInPicture(video, doc), true);
    doc.pictureInPictureElement = video;
    assert.equal(await togglePictureInPicture(video, doc), false);
    assert.equal(calls, 1);
    assert.equal(canPictureInPicture({}, {}), false);
  });
});
