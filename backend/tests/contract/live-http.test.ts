import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { testApp } from "../helpers/app.ts";

describe("live board HTTP", () => {
  let app: FastifyInstance;
  before(async () => {
    app = await testApp();
  });
  after(async () => {
    await app.close();
  });

  it("GET /api/live-board without uid is 400", async () => {
    const res = await app.inject({ method: "GET", url: "/api/live-board" });
    assert.equal(res.statusCode, 400);
  });

  it("GET /api/live-board rejects a short uid", async () => {
    const res = await app.inject({ method: "GET", url: "/api/live-board?uid=ab" });
    assert.equal(res.statusCode, 400);
  });

  it("SSE handler advertises an unbuffered event-stream", () => {
    const src = readFileSync(new URL("../../src/routes/http/live-board.ts", import.meta.url), "utf8");
    assert.match(src, /text\/event-stream/);
    assert.match(src, /X-Accel-Buffering/);
    assert.match(src, /retry: 2500/);
  });
});
