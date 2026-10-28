import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESK_ITEMS, deskActive } from "./desk.ts";

describe("Desk chrome", () => {
  it("has exactly four destinations", () => {
    assert.deepEqual(
      DESK_ITEMS.map((i) => i.id),
      ["home", "library", "planner", "saves"],
    );
    assert.deepEqual(
      DESK_ITEMS.map((i) => i.label),
      ["Home", "Library", "Planner", "Saves"],
    );
  });

  it("maps routes onto the rail", () => {
    assert.equal(deskActive("/"), "home");
    assert.equal(deskActive("/exam/YOTUH"), "home");
    assert.equal(deskActive("/search"), "library");
    assert.equal(deskActive("/teacher/pankaj"), "library");
    assert.equal(deskActive("/course/abc"), "library");
    assert.equal(deskActive("/batch/abc"), "library");
    assert.equal(deskActive("/planner"), "planner");
    assert.equal(deskActive("/planner/today"), "planner");
    assert.equal(deskActive("/offline"), "saves");
    assert.equal(deskActive("/play/lesson"), null);
  });

  it("never leaves two tabs active for the same path", () => {
    const paths = ["/", "/exam/YOTUH", "/search", "/planner/today", "/offline", "/play/x"];
    for (const path of paths) {
      const hits = DESK_ITEMS.filter((item) => item.match(path));
      if (path.startsWith("/play/")) assert.equal(hits.length, 0);
      else assert.equal(hits.length, 1, path);
    }
  });
});
