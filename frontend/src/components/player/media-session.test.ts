import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionHandlers } from "./media-session.ts";

describe("lock screen controls", () => {
  it("play and pause call the video", () => {
    const calls: string[] = [];
    const actions = sessionHandlers({
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
    });
    actions.play();
    actions.pause();
    assert.deepEqual(calls, ["play", "pause"]);
  });
});
