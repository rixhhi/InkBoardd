import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { continueLecture, detectFolderKind, nextSavedLecture, prevSavedLecture } from "@inkboard/shared/bundle/chapter-nav";
import type { SavedChapterLecture } from "@inkboard/shared/bundle/chapter";

function row(id: string, order: number, status: SavedChapterLecture["status"] = "done"): SavedChapterLecture {
  return {
    lessonId: id,
    title: id,
    order,
    durationMs: 60_000,
    dir: `${String(order).padStart(3, "0")}-lecture-${id}`,
    status,
  };
}

describe("chapter folder detection", () => {
  it("detects a chapter folder", () => {
    assert.equal(detectFolderKind(["chapter.json", "001-lecture-A/manifest.json"]), "chapter");
  });

  it("detects a single lecture folder", () => {
    assert.equal(detectFolderKind(["manifest.json", "media.webm"]), "lecture");
  });

  it("is unknown without either", () => {
    assert.equal(detectFolderKind(["notes.pdf"]), "unknown");
  });
});

describe("next-lecture order", () => {
  const lectures = [row("AAA111AAAA", 1), row("BBB222BBBB", 2, "archived"), row("CCC333CCCC", 3)];

  it("skips archived when going next", () => {
    assert.equal(nextSavedLecture(lectures, "AAA111AAAA")?.lessonId, "CCC333CCCC");
  });

  it("goes previous to the last done lecture", () => {
    assert.equal(prevSavedLecture(lectures, "CCC333CCCC")?.lessonId, "AAA111AAAA");
  });

  it("continues at the first unfinished", () => {
    const pos = (id: string) => (id === "AAA111AAAA" ? 59 : 0);
    assert.equal(continueLecture(lectures, pos)?.lessonId, "CCC333CCCC");
  });
});
