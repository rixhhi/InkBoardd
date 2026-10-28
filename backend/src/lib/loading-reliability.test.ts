import assert from "node:assert/strict";
import test from "node:test";
import { catalogSignal } from "@inkboard/shared/catalog-signal";
import { upstreamNotFound } from "@inkboard/shared/http-error";
import { publicError } from "../http.ts";
import { swr, swrReset } from "./swr-cache.ts";

test("a failed background refresh keeps the stale page and the process", async () => {
  swrReset();
  let calls = 0;
  const first = await swr(
    "hub-test",
    1,
    async () => {
      calls += 1;
      return { teachers: ["a"] };
    },
    60_000,
  );
  assert.deepEqual(first, { teachers: ["a"] });
  await new Promise((r) => setTimeout(r, 5));
  const second = await swr(
    "hub-test",
    1,
    async () => {
      calls += 1;
      throw new Error("This wall did not load");
    },
    60_000,
  );
  assert.deepEqual(second, { teachers: ["a"] });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, 2);
  swrReset();
});

test("an upstream 404 stays a 404 and does not raise the catalog banner", () => {
  const mapped = publicError(upstreamNotFound("Unacademy request failed (404)"));
  assert.equal(mapped.status, 404);
  assert.equal(mapped.code, "NOT_FOUND");
  assert.equal(catalogSignal("/api/exams/NVLIA/hub", false, mapped.status, mapped.code), "ignore");
  assert.equal(catalogSignal("/api/exams/NVLIA/hub", false, 0, "NETWORK"), "down");
  assert.equal(catalogSignal("/api/exams/NVLIA/hub", false, 502, "UPSTREAM"), "down");
});
