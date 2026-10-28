import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { breakerOpen } from "@inkboard/shared/http-error";
import { setPersistentLoader, swr, swrPeek, swrReset } from "./swr-cache.ts";

describe("open breaker serves postgres when memory is empty", () => {
  it("returns the stored page and does not cache the failure", async () => {
    swrReset();
    const stored = { lessons: [{ uid: "L1" }], course: { uid: "C1" } };
    setPersistentLoader(async () => stored);
    const data = await swr<{ lessons: { uid: string }[]; course: { uid: string } }>(
      "round3:breaker",
      1_000,
      async () => {
        throw breakerOpen("Catalog is unavailable. Try again shortly.", 5);
      },
      1_000,
      () => true,
    );
    assert.equal(data.lessons[0]?.uid, "L1");
    assert.equal(swrPeek<typeof stored>("round3:breaker")?.course.uid, "C1");
    swrReset();
  });
});
