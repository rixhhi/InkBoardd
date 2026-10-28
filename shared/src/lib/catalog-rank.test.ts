import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { byCatalogScore } from "./catalog-rank.ts";

describe("catalog rank", () => {
  it("puts a title match ahead of a topic match and a teacher match", () => {
    const ranked = byCatalogScore(
      [
        { name: "Aman", topic: "optics", username: "aman" },
        { name: "Optics basics", topic: "waves", username: "neha" },
        { name: "Waves", topic: "sound", username: "opticslab" },
      ],
      "optics",
      (row) => ({ title: row.name, topic: row.topic, educator: row.username }),
    );
    assert.deepEqual(
      ranked.map((row) => row.name),
      ["Optics basics", "Aman", "Waves"],
    );
  });
});
