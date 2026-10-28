import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lectureHref, searchLocal, searchStudy } from "./local-search.ts";

describe("search on this device", () => {
  it("ranks a title that starts with the query ahead of one that only contains it", () => {
    const hits = searchLocal(
      [
        { title: "Intro to cells", href: "/play/a?t=0", kind: "task" },
        { title: "Cells and tissue", href: "/play/b?t=12", kind: "note" },
      ],
      "cel",
    );
    assert.equal(hits[0]?.title, "Cells and tissue");
    assert.equal(hits[1]?.title, "Intro to cells");
  });

  it("ignores a one-letter query", () => {
    assert.deepEqual(searchLocal([{ title: "Cells", href: "/play/a?t=0", kind: "task" }], "c"), []);
  });

  it("builds a timestamp link", () => {
    assert.equal(lectureHref("L 1", 90.8), "/play/L%201?t=90");
    assert.equal(lectureHref("L1", 0), "/play/L1?t=0");
  });

  it("finds a bookmark note and keeps the timestamp", () => {
    const [hit] = searchStudy(
      [
        { title: "Kinematics", text: "remember the sign of acceleration", href: "/play/L1?t=84", kind: "bookmark" },
        { title: "Algebra", text: "factors", href: "/planner/today", kind: "task" },
      ],
      "sign",
    );
    assert.equal(hit?.href, "/play/L1?t=84");
    assert.equal(hit?.snippet.match.toLowerCase(), "sign");
    assert.match(hit?.snippet.before ?? "", /remember/);
  });
});

