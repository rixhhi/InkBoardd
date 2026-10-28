import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractReplayId, isReplayId, normalizeUsername } from "@inkboard/shared/unacademy-ids";

describe("unacademy ids", () => {
  it("accepts lesson-raw urls and bare replay ids", () => {
    assert.equal(isReplayId("2O24MEDDGPTI2AZ00YMV"), true);
    assert.equal(
      isReplayId("https://uamedia.uacdn.net/lesson-raw/2O24MEDDGPTI2AZ00YMV/output.webm"),
      true,
    );
    assert.equal(isReplayId("not-an-id"), false);
    assert.equal(isReplayId(""), false);
  });

  it("extracts the replay uid from a CDN url", () => {
    assert.equal(
      extractReplayId("https://uamedia.uacdn.net/lesson-raw/X218PNMYZV6KGXQO349Q/output.webm"),
      "X218PNMYZV6KGXQO349Q",
    );
    assert.equal(extractReplayId("ALWUU2K6IQTV516WG9NN"), "ALWUU2K6IQTV516WG9NN");
    assert.equal(extractReplayId("https://unacademy.com/class/foo/ABC"), null);
    assert.equal(
      extractReplayId(
        "https://player.uacdn.net/liveweb/v4036/index.html?replay=true&uid=W7H99XZRXX5VBNJ21PZR&chat_id=Z1RU910O&version=4036",
      ),
      "W7H99XZRXX5VBNJ21PZR",
    );
    assert.equal(extractReplayId("https://player.uacdn.net/liveweb/v4036/index.html?chat_id=Z1RU910O"), null);
  });

  it("strips @ and slashes and lowercases usernames", () => {
    assert.equal(normalizeUsername("@agsir"), "agsir");
    assert.equal(normalizeUsername("  /physicsbyprateekjain  "), "physicsbyprateekjain");
    assert.equal(normalizeUsername("AnkitDoylasir"), "ankitdoylasir");
    assert.equal(normalizeUsername("VishalRawtiya"), "vishalrawtiya");
    assert.equal(normalizeUsername("@VishalRawtiya"), "vishalrawtiya");
  });
});
