import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromeLabel, hindiKeys, otherLocale } from "./i18n.ts";

describe("language", () => {
  it("keeps English unless Hindi is selected", () => {
    assert.equal(chromeLabel("en", "library", "Library"), "Library");
    assert.equal(chromeLabel("hi", "library", "Library"), "पुस्तकालय");
    assert.equal(chromeLabel("hi", "missing", "Library"), "Library");
  });

  it("covers the rail and the offline line in Hindi", () => {
    for (const id of ["home", "live", "library", "planner", "saves", "search", "pickExam", "continueLine", "searchWhere", "offline", "tryAgain"]) {
      assert.ok(hindiKeys().includes(id));
      const phrase = chromeLabel("hi", id, "English");
      assert.notEqual(phrase, "English");
      assert.ok(phrase.length > 0);
    }
  });

  it("toggles between the two languages", () => {
    assert.equal(otherLocale("en"), "hi");
    assert.equal(otherLocale("hi"), "en");
  });
});
