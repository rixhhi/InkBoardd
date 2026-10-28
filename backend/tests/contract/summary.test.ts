import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { testApp } from "../helpers/app.ts";

describe("study summary contract", () => {
  let app: FastifyInstance;
  const previous = process.env.XAI_API_KEY;

  before(async () => {
    delete process.env.XAI_API_KEY;
    app = await testApp();
  });

  after(async () => {
    if (previous === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previous;
    await app.close();
  });

  it("rejects a body with nothing to summarize", async () => {
    const res = await app.inject({ method: "POST", url: "/api/study/summary", payload: { title: "Empty" } });
    assert.equal(res.statusCode, 400);
    assert.match(String(res.headers["content-type"] || ""), /json/i);
  });

  it("returns a board outline when no model key is set", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/study/summary",
      payload: {
        title: "Newton",
        chapters: [{ t: 40, label: "Slide 2" }],
        notes: [],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { source: string; bullets: string[] };
    assert.equal(body.source, "board");
    assert.match(body.bullets[0] || "", /Slide 2/);
  });
});
