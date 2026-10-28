import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchHitTarget } from "./search-keys.ts";

describe("search result keys", () => {
  it("moves from the field into the list and back", () => {
    assert.equal(searchHitTarget(3, -1, "ArrowDown"), 0);
    assert.equal(searchHitTarget(3, 0, "ArrowDown"), 1);
    assert.equal(searchHitTarget(3, 1, "ArrowDown"), 2);
    assert.equal(searchHitTarget(3, 2, "ArrowDown"), "stay");
    assert.equal(searchHitTarget(3, 2, "ArrowUp"), 1);
    assert.equal(searchHitTarget(3, 0, "ArrowUp"), "field");
    assert.equal(searchHitTarget(0, -1, "ArrowDown"), "stay");
    assert.equal(searchHitTarget(2, 0, "Enter"), "stay");
  });
});
