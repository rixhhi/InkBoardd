import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canPushNow, nextRetryMs, shouldRetryPush, statusAfterLoadOk, statusAfterPushFail, statusSignedOut } from "@inkboard/shared/planner/sync-machine";

describe("sync machine", () => {
  it("backs off with jitter and caps at 30s", () => {
    const a = nextRetryMs(0, 0);
    const b = nextRetryMs(2, 0);
    const c = nextRetryMs(20, 1);
    assert.equal(a, 800);
    assert.ok(b > a);
    assert.equal(c, 30_250);
  });

  it("never pushes until a remote load succeeded", () => {
    assert.equal(
      canPushNow({ canSync: true, loadedOk: false, pushing: false, dirty: true, online: true }),
      false,
    );
    assert.equal(
      canPushNow({ canSync: true, loadedOk: true, pushing: false, dirty: true, online: true }),
      true,
    );
    assert.equal(
      canPushNow({ canSync: true, loadedOk: true, pushing: true, dirty: true, online: true }),
      false,
    );
    assert.equal(
      canPushNow({ canSync: true, loadedOk: true, pushing: false, dirty: true, online: false }),
      false,
    );
  });

  it("maps push failures and signed-out status", () => {
    assert.equal(statusAfterPushFail(true), "error");
    assert.equal(statusAfterPushFail(false), "offline");
    assert.equal(statusAfterLoadOk(), "synced");
    assert.equal(statusSignedOut(), "local-only");
    assert.equal(shouldRetryPush(true, true), true);
    assert.equal(shouldRetryPush(false, true), false);
  });
});
