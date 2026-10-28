import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServerFn } from "../../src/lib/server-fn.ts";

describe("createServerFn adapter", () => {
  it("unwraps Fastify-style { goalId } into handler data", async () => {
    const fn = createServerFn({ method: "POST" })
      .validator((d: unknown) => {
        const rec = d && typeof d === "object" ? (d as { goalId?: string }) : {};
        if (!rec.goalId) throw new Error("Unknown exam");
        return { goalId: rec.goalId };
      })
      .handler(async ({ data }) => ({ ok: true, goalId: data.goalId }));
    const out = await fn({ goalId: "YOTUH" });
    assert.deepEqual(out, { ok: true, goalId: "YOTUH" });
  });

  it("lets validator failures bubble as thrown errors", async () => {
    const fn = createServerFn()
      .validator(() => {
        throw new Error("Invalid lesson id");
      })
      .handler(async () => 1);
    await assert.rejects(() => fn({}), /Invalid lesson id/);
  });

  it("handler-only functions still receive a data bag", async () => {
    const fn = createServerFn({ method: "GET" }).handler(async () => ({ live: [], later: [] }));
    const out = await fn();
    assert.deepEqual(out, { live: [], later: [] });
  });
});
