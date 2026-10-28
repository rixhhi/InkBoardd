import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetProxyLimits } from "@inkboard/shared/cdn-proxy";
import { handleLiveBoard } from "../../src/routes/http/live-board.ts";

afterEach(() => resetProxyLimits());

describe("live board contract", () => {
  it("missing uid is 400", async () => {
    const res = await handleLiveBoard(new Request("http://local/api/live-board"));
    assert.equal(res.status, 400);
    assert.match(await res.text(), /invalid class/i);
  });

  it("rejects a uid that is too short", async () => {
    const res = await handleLiveBoard(new Request("http://local/api/live-board?uid=ab"));
    assert.equal(res.status, 400);
  });

  it("rejects a uid with path characters", async () => {
    const res = await handleLiveBoard(new Request("http://local/api/live-board?uid=../x"));
    assert.equal(res.status, 400);
  });

  it("a forged x-forwarded-for does not mint a new live-board bucket", async () => {
    for (let i = 0; i < 8; i++) {
      const res = await handleLiveBoard(
        new Request("http://local/api/live-board", { headers: { "x-forwarded-for": "203.0.113.9" } }),
        "10.0.0.8",
      );
      assert.equal(res.status, 400);
    }
    const forged = await handleLiveBoard(
      new Request("http://local/api/live-board", { headers: { "x-forwarded-for": "198.51.100.7" } }),
      "10.0.0.8",
    );
    assert.equal(forged.status, 429);
  });

  it("rate-limits live-board after 8 hits from one IP", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    let last = 400;
    for (let i = 0; i < 9; i++) {
      const res = await handleLiveBoard(new Request("http://local/api/live-board", { headers }));
      last = res.status;
    }
    assert.equal(last, 429);
  });
});
