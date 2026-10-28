import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertPublicAddresses, assertPublicUrl, isPrivateAddress } from "./ssrf.ts";

describe("ssrf address checks", () => {
  it("rejects loopback, private, link-local, and metadata hosts", () => {
    for (const host of ["127.0.0.1", "10.0.0.8", "192.168.1.1", "172.16.0.4", "169.254.169.254", "localhost", "::1", "metadata.google.internal"]) {
      assert.equal(isPrivateAddress(host), true, host);
    }
    assert.equal(isPrivateAddress("player.uacdn.net"), false);
  });

  it("rejects a URL that points at the cloud metadata address", () => {
    assert.throws(() => assertPublicUrl(new URL("http://169.254.169.254/latest/meta-data")), /Blocked address/);
    assert.throws(() => assertPublicUrl(new URL("http://127.0.0.1/")), /Blocked address/);
    assert.doesNotThrow(() => assertPublicUrl(new URL("https://player.uacdn.net/a.jpg")));
  });

  it("rejects a DNS answer that lands on a private address", () => {
    assert.throws(() => assertPublicAddresses(["8.8.8.8", "127.0.0.1"]), /Blocked address/);
    assert.doesNotThrow(() => assertPublicAddresses(["151.101.1.1"]));
  });
});
