import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { missedMoves } from "./catch-up.ts";

describe("missed work", () => {
  it("keeps pending tasks from earlier days and drops the rest", () => {
    const moved = missedMoves(
      [
        { id: "a", date: "2026-03-01", status: "pending" },
        { id: "b", date: "2026-03-02", status: "done" },
        { id: "c", date: "2026-03-03", status: "pending" },
        { id: "d", date: "2026-03-04", status: "pending", deletedAt: "2026-03-04T00:00:00.000Z" },
      ],
      "2026-03-03",
    );
    assert.deepEqual(moved.map((task) => task.id), ["a"]);
  });

  it("returns nothing for a bad day", () => {
    assert.deepEqual(missedMoves([{ id: "a", date: "2026-03-01", status: "pending" }], "today"), []);
  });
});
