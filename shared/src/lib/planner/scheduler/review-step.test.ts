import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rateReviewInterval, } from "./days.ts";

describe("review intervals", () => {
  it("never goes backwards when the recall is better", () => {
    for (let days = 1; days <= 60; days += 1) {
      const shaky = rateReviewInterval(days, "shaky");
      const ok = rateReviewInterval(days, "ok");
      const solid = rateReviewInterval(days, "solid");
      assert.ok(shaky >= 1 && shaky <= ok && ok <= solid);
    }
  });
});
