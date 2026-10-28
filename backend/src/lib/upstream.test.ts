import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { upstreamBad, upstreamNotFound, upstreamTimeout } from "@inkboard/shared/http-error";
import {
  clearUpstreamFail,
  isUpstreamOutage,
  noteUpstreamOk,
  readUpstreamFail,
  reportUpstreamFail,
} from "@inkboard/shared/upstream";

describe("upstream outage vs empty content", () => {
  it("treats typed 404 as empty, and typed 5xx as an outage", () => {
    assert.equal(isUpstreamOutage(upstreamNotFound()), false);
    assert.equal(isUpstreamOutage(new Error("Unacademy request failed (404)")), false);
    assert.equal(isUpstreamOutage(new Error("fetch failed")), false);
    assert.equal(isUpstreamOutage(upstreamBad(503)), true);
    assert.equal(isUpstreamOutage(upstreamTimeout()), true);
    assert.equal(isUpstreamOutage(new Error("Request aborted")), false);
  });

  it("remembers a recent outage and forgets 404s", () => {
    clearUpstreamFail();
    reportUpstreamFail("hub", upstreamNotFound());
    assert.equal(readUpstreamFail(1_000), null);
    reportUpstreamFail("hub", upstreamBad(502), 1_000);
    const hit = readUpstreamFail(1_000);
    assert.ok(hit);
    assert.equal(hit.scope, "hub");
    assert.equal(hit.status, 502);
    assert.equal(readUpstreamFail(hit.at + 6 * 60_000), null);
    reportUpstreamFail("hub", upstreamBad(502), hit.at + 1);
    const again = readUpstreamFail(hit.at + 1);
    assert.ok(again);
    noteUpstreamOk(again.at + 1);
    assert.equal(readUpstreamFail(again.at + 1), null);
    noteUpstreamOk(5_000);
    reportUpstreamFail("hub", upstreamBad(503), 5_000 + 1_000);
    assert.equal(readUpstreamFail(6_000), null, "a page that just loaded does not raise the banner");
    reportUpstreamFail("hub", upstreamBad(503), 5_000 + 21_000);
    assert.equal(readUpstreamFail(26_000)?.status, 503);
    clearUpstreamFail();
    assert.equal(readUpstreamFail(), null);
  });
});
