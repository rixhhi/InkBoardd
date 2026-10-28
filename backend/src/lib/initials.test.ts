import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initialsFrom } from "@inkboard/shared/initials";

describe("initialsFrom", () => {
  it("uses first and last word", () => {
    assert.equal(initialsFrom("Ankit Doyla"), "AD");
    assert.equal(initialsFrom("AG sir"), "AS");
  });

  it("uses two letters of a single token", () => {
    assert.equal(initialsFrom("agsir"), "AG");
    assert.equal(initialsFrom("@nitesh"), "NI");
  });

  it("returns empty for blank", () => {
    assert.equal(initialsFrom(""), "");
    assert.equal(initialsFrom(null), "");
  });
});
