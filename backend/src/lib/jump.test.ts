import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractPlayId,
  itemsFromCourse,
  itemsFromEducator,
  itemsFromHub,
  parseAtUser,
  rankJumps,
  jumpGroupCopy,
  type JumpItem,
} from "@inkboard/shared/jump";

describe("jump helpers", () => {
  it("parses @username and play ids", () => {
    assert.equal(parseAtUser("@agsir"), "agsir");
    assert.equal(parseAtUser("agsir"), "");
    assert.equal(parseAtUser("@a"), "");
    assert.equal(extractPlayId("2O24MEDDGPTI2AZ00YMV"), "2O24MEDDGPTI2AZ00YMV");
    assert.equal(extractPlayId("https://unacademy.com/lesson-raw/2O24MEDDGPTI2AZ00YMV/output.webm"), "2O24MEDDGPTI2AZ00YMV");
    assert.equal(extractPlayId("hello"), null);
  });

  it("ranks label prefix above a later substring", () => {
    const items: JumpItem[] = [
      { group: "Exams", id: "YOTUH", label: "NEET UG", href: { kind: "exam", id: "YOTUH" } },
      { group: "Exams", id: "NVLIA", label: "GATE CS", href: { kind: "exam", id: "NVLIA" } },
    ];
    assert.deepEqual(
      rankJumps("gate", items).map((i) => i.label),
      ["GATE CS"],
    );
    assert.equal(rankJumps("", items).length, 2);
    assert.equal(jumpGroupCopy("Watch later"), "Folded");
    assert.equal(jumpGroupCopy("Resume"), "On the board");
  });

  it("builds items from hub, course and educator payloads", () => {
    const hub = itemsFromHub({
      teachers: [{ username: "agsir", name: "AG sir" }],
      courses: [{ uid: "COURSE1", name: "TOC", slug: "toc", authorUsername: "ankit" }],
    });
    assert.equal(hub.some((i) => i.group === "Teachers" && i.href.kind === "teacher"), true);
    assert.equal(hub.some((i) => i.group === "Courses" && i.href.kind === "course"), true);

    const course = itemsFromCourse({
      course: { uid: "C1", name: "OS" },
      lessons: [
        { uid: "L1", title: "Intro", replayId: "ABCDEF1234567890" },
        { uid: "L2", title: "Skipped", replayId: null },
      ],
    });
    assert.equal(course.filter((i) => i.group === "Classes").length, 1);

    const edu = itemsFromEducator({
      username: "vishalrawtiya",
      name: "Vishal",
      courses: [{ uid: "DM", name: "Discrete Math" }],
    });
    assert.equal(edu[0]?.href.kind, "teacher");
    assert.equal(edu[1]?.group, "Courses");
  });
});
