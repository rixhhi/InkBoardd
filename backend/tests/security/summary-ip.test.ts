import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { resetProxyLimits } from "@inkboard/shared/cdn-proxy";
import { testApp } from "../helpers/app.ts";

describe("summary rate limit ignores a spoofed forwarding header", () => {
  let app: FastifyInstance;
  before(async () => {
    delete process.env.TRUST_PROXY;
    resetProxyLimits();
    app = await testApp();
  });
  after(async () => {
    await app.close();
  });

  it("shares one bucket when X-Forwarded-For changes and the proxy is not trusted", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/study/summary",
        headers: { "x-forwarded-for": `203.0.113.${i}` },
        payload: {},
      });
      statuses.push(res.statusCode);
    }
    assert.equal(statuses[6], 429);
    assert.ok(statuses.slice(0, 6).every((code) => code !== 429));
  });
});
