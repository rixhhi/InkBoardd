import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { friendlyBundleError } from "@inkboard/shared/bundle/errors";

describe("friendlyBundleError", () => {
  it("maps browser, incomplete, version, checksum", () => {
    assert.equal(friendlyBundleError(new Error("unsupported browser")).code, "browser");
    assert.equal(friendlyBundleError(new Error("incomplete bundle (no manifest)")).code, "incomplete");
    assert.equal(friendlyBundleError(new Error("unsupported bundle version 9")).code, "version");
    assert.equal(friendlyBundleError(new Error("media.webm sha256 mismatch")).code, "checksum");
    assert.equal(friendlyBundleError(new Error("media.webm missing")).code, "media");
  });
});
