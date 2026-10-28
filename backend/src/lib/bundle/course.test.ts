import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COURSE_FORMAT, buildCourse, saveCourseCommand, validateCourse, validateSavedCourse } from "@inkboard/shared/bundle/course";
import { continueCourseLecture, courseProgress, detectFolderKind, flattenCourseLectures } from "@inkboard/shared/bundle/chapter-nav";

function lec(id: string, order: number) {
  return { lessonId: id, title: `L ${order}`, order, durationMs: 60_000 };
}

function course(over: Record<string, unknown> = {}) {
  return {
    format: COURSE_FORMAT,
    version: 1,
    courseId: "COURSE1",
    courseTitle: "Bonding",
    createdAt: "2026-10-04T00:00:00.000Z",
    chapters: [
      { chapterId: "w1", chapterTitle: "Week 1", order: 1, lectures: [lec("LESSON01ABCDEF", 1)] },
      { chapterId: "w2", chapterTitle: "Week 2", order: 2, lectures: [lec("LESSON02ABCDEF", 1)] },
    ],
    ...over,
  };
}

describe("validateCourse", () => {
  it("accepts a valid course", () => {
    const c = validateCourse(course());
    assert.equal(c.chapters.length, 2);
  });

  it("rejects a wrong format", () => {
    assert.throws(() => validateCourse(course({ format: "nope" })), /unknown format/);
  });

  it("rejects duplicate ids across chapters", () => {
    assert.throws(
      () =>
        validateCourse(
          course({
            chapters: [
              { chapterId: "w1", chapterTitle: "Week 1", order: 1, lectures: [lec("LESSON01ABCDEF", 1)] },
              { chapterId: "w2", chapterTitle: "Week 2", order: 2, lectures: [lec("LESSON01ABCDEF", 1)] },
            ],
          }),
        ),
      /duplicate lesson id/,
    );
  });

  it("rejects an empty chapter", () => {
    assert.throws(
      () =>
        validateCourse(
          course({
            chapters: [{ chapterId: "w1", chapterTitle: "Week 1", order: 1, lectures: [] }],
          }),
        ),
      /lectures is empty/,
    );
  });

  it("rejects over the chapter cap inside a course", () => {
    const lectures = Array.from({ length: 61 }, (_, i) => lec(`LESSON${String(i + 1).padStart(2, "0")}ABCDEF`, i + 1));
    assert.throws(
      () =>
        validateCourse(
          course({
            chapters: [{ chapterId: "w1", chapterTitle: "Week 1", order: 1, lectures }],
          }),
        ),
      /may hold 60/,
    );
  });

  it("rejects over 400 lectures", () => {
    const chapters = Array.from({ length: 8 }, (_, c) => ({
      chapterId: `w${c + 1}`,
      chapterTitle: `Week ${c + 1}`,
      order: c + 1,
      lectures: Array.from({ length: 51 }, (_, i) =>
        lec(`LESSON${String(c * 51 + i + 1).padStart(3, "0")}ABCDEF`, i + 1),
      ),
    }));
    assert.throws(() => validateCourse(course({ chapters })), /will not take more than 400/);
  });
});

describe("buildCourse", () => {
  it("turns week groups into chapters and drops empty weeks", () => {
    const c = buildCourse({
      courseId: "COURSE1",
      courseTitle: "Bonding",
      chapters: [
        {
          chapterId: "w1",
          chapterTitle: "Week 1",
          lessons: [{ replayId: "REPLAY01ABCD", title: "A", durationSec: 10, playable: true, status: "replay" }],
        },
        {
          chapterId: "w2",
          chapterTitle: "Week 2",
          lessons: [{ replayId: "LIVE01ABCDEF", title: "B", durationSec: 10, playable: true, status: "live" }],
        },
      ],
    });
    assert.equal(c.chapters.length, 1);
    assert.equal(c.chapters[0]?.chapterTitle, "Week 1");
    assert.equal(saveCourseCommand("bonding"), "npm run save-course -- ./course-bonding.json --out ./saved");
  });
});

describe("viewer course helpers", () => {
  it("detects a course folder by course.json", () => {
    assert.equal(detectFolderKind(["course.json", "01_Week1/chapter.json"]), "course");
    assert.equal(detectFolderKind(["chapter.json"]), "chapter");
    assert.equal(detectFolderKind(["manifest.json"]), "lecture");
  });

  it("orders next lecture across weeks", () => {
    const saved = validateSavedCourse({
      ...course(),
      format: "inkboard-course-saved",
      chapters: [
        {
          chapterId: "w1",
          chapterTitle: "Week 1",
          order: 1,
          dir: "01_Week1",
          status: "done",
          lectures: [{ ...lec("LESSON01ABCDEF", 1), dir: "01_L1", status: "done" }],
        },
        {
          chapterId: "w2",
          chapterTitle: "Week 2",
          order: 2,
          dir: "02_Week2",
          status: "done",
          lectures: [{ ...lec("LESSON02ABCDEF", 1), dir: "01_L2", status: "done" }],
        },
      ],
    });
    const flat = flattenCourseLectures(saved);
    assert.equal(flat[1]?.dir, "02_Week2/01_L2");
    assert.deepEqual(courseProgress(saved), { saved: 2, total: 2 });
    const cont = continueCourseLecture(saved, () => 0);
    assert.equal(cont?.lecture.lessonId, "LESSON01ABCDEF");
  });
});
