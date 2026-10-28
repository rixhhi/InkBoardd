import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redisUrlWithTls } from "../../src/repositories/redis/client.ts";

describe("redis url", () => {
  it("upgrades managed hosts to TLS", () => {
    assert.equal(redisUrlWithTls("redis://default:pw@normal-fawn-1.upstash.io:6379"), "rediss://default:pw@normal-fawn-1.upstash.io:6379");
  });
  it("leaves local and already-TLS URLs alone", () => {
    assert.equal(redisUrlWithTls("redis://127.0.0.1:6379"), "redis://127.0.0.1:6379");
    assert.equal(redisUrlWithTls("rediss://x.upstash.io:6379"), "rediss://x.upstash.io:6379");
  });
});
