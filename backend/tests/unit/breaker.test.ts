import assert from "node:assert/strict";
import test from "node:test";
import { createBreaker } from "../../src/lib/breaker.ts";
import { upstreamNotFound, upstreamTimeout } from "@inkboard/shared/http-error";

test("the breaker opens after repeated failures and closes after a success", async () => {
  let t = 1_000;
  const breaker = createBreaker({ failures: 2, resetMs: 500, now: () => t });
  await assert.rejects(() => breaker.run(() => Promise.reject(upstreamTimeout())));
  await assert.rejects(() => breaker.run(() => Promise.reject(upstreamTimeout())));
  assert.equal(breaker.open(), true);
  await assert.rejects(() => breaker.run(() => Promise.resolve("nope")), /unavailable/i);
  t = 1_600;
  assert.equal(breaker.open(), false);
  assert.equal(await breaker.run(() => Promise.resolve("ok")), "ok");
  assert.equal(breaker.open(), false);
});

test("a missing page does not open the breaker", async () => {
  const breaker = createBreaker({ failures: 2, resetMs: 500 });
  for (let i = 0; i < 4; i += 1) {
    await assert.rejects(() => breaker.run(() => Promise.reject(upstreamNotFound())));
  }
  assert.equal(breaker.open(), false);
  assert.equal(breaker.failures(), 0);
});
