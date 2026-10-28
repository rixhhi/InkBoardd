import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAPTER_FORMAT,
  CHAPTER_MAX_LECTURES,
  buildChapter,
  chapterFileSlug,
  chapterFolderName,
  courseFolderName,
  estimateLectureBytes,
  ESTIMATE_BYTES_OVERHEAD,
  ESTIMATE_BYTES_PER_10_MIN,
  folderSlug,
  isSafeFolderName,
  lectureDirName,
  lectureFolderName,
  lectureStatusLabel,
  naturalLectureSort,
  playableReplays,
  saveChapterCommand,
  uniqueName,
  validateChapter,
  validateSavedChapter,
} from "@inkboard/shared/bundle/chapter";

function lecture(i: number, over: Record<string, unknown> = {}) {
  return {
    lessonId: `LESSON${String(i).padStart(2, "0")}ABCDEF`,
    title: `Class ${i}`,
    order: i,
    durationMs: 60_000,
    ...over,
  };
}

function good(over: Record<string, unknown> = {}) {
  return {
    format: CHAPTER_FORMAT,
    version: 1,
    courseId: "COURSE1",
    courseTitle: "Chemical Bonding",
    chapterId: "COURSE1-week-2",
    chapterTitle: "Week 2",
    createdAt: "2026-10-04T00:00:00.000Z",
    lectures: [lecture(1), lecture(2)],
    ...over,
  };
}

describe("validateChapter", () => {
  it("accepts a valid chapter", () => {
    const c = validateChapter(good());
    assert.equal(c.lectures.length, 2);
    assert.equal(c.chapterTitle, "Week 2");
  });

  it("rejects a wrong format", () => {
    assert.throws(() => validateChapter(good({ format: "nope" })), /unknown format/);
  });

  it("rejects duplicate ids", () => {
    assert.throws(
      () => validateChapter(good({ lectures: [lecture(1), lecture(1, { order: 2 })] })),
      /duplicate lesson id/,
    );
  });

  it("rejects 31 lectures", () => {
    const lectures = Array.from({ length: CHAPTER_MAX_LECTURES + 1 }, (_, i) => lecture(i + 1));
    assert.throws(() => validateChapter(good({ lectures })), /will not take more than 30/);
  });

  it("rejects a bad id", () => {
    assert.throws(
      () => validateChapter(good({ lectures: [lecture(1, { lessonId: "ab" })] })),
      /lessonId is invalid/,
    );
  });

  it("rejects an empty list", () => {
    assert.throws(() => validateChapter(good({ lectures: [] })), /lectures is empty/);
  });

  it("accepts a title-based dir on a saved chapter", () => {
    const saved = validateSavedChapter({
      ...good(),
      format: "inkboard-chapter-saved",
      lectures: [{ ...lecture(1), dir: "01_Class1", status: "done" }, { ...lecture(2), dir: "02_Class2", status: "pending" }],
    });
    assert.equal(saved.lectures[0]?.dir, "01_Class1");
  });

  it("still accepts an old NNN-lecture-id dir", () => {
    const saved = validateSavedChapter({
      ...good(),
      format: "inkboard-chapter-saved",
      lectures: [
        { ...lecture(1), dir: "001-lecture-LESSON01ABCDEF", status: "done" },
        { ...lecture(2), dir: "002-lecture-LESSON02ABCDEF", status: "pending" },
      ],
    });
    assert.equal(saved.lectures[0]?.dir, "001-lecture-LESSON01ABCDEF");
  });
});

describe("folder names", () => {
  it("builds PascalCase slugs", () => {
    assert.equal(folderSlug("Orientation Session"), "OrientationSession");
    assert.equal(folderSlug("Counting Techniques - Part I"), "CountingTechniquesPartI");
    assert.equal(folderSlug("Probability & Statistics"), "ProbabilityStatistics");
    assert.equal(folderSlug("  "), "Untitled");
    assert.equal(folderSlug("🔥🔥"), "Untitled");
    assert.equal(folderSlug("café"), "Café");
    assert.equal(folderSlug("cafe\u0301"), "Café");
    assert.equal(folderSlug("hub\u0327"), "Hub\u0327");
    assert.equal(folderSlug("Hello."), "Hello");
    assert.equal(lectureFolderName(1, "Orientation Session"), "01_OrientationSession");
    assert.equal(lectureFolderName(3, "GOC", 120), "003_GOC");
    assert.equal(chapterFolderName(2, "Week 2", 6), "02_Week2");
    assert.equal(courseFolderName("Chemical Bonding"), "ChemicalBonding");
  });

  it("truncates a long title on a word boundary", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Word${i}`).join(" ");
    const slug = folderSlug(long, 20);
    assert.ok(slug.length <= 20);
    assert.equal(slug, "Word0Word1Word2Word3");
  });

  it("guards Windows reserved names and unique names", () => {
    assert.equal(isSafeFolderName("CON"), false);
    assert.equal(isSafeFolderName("01_Week2"), true);
    assert.equal(isSafeFolderName("foo/bar"), false);
    assert.equal(isSafeFolderName(" ends"), false);
    assert.equal(folderSlug("CON"), "CONFolder");
    const taken = new Set(["01_Week2"]);
    assert.equal(uniqueName("01_Week2", taken), "01_Week2_2");
    assert.equal(uniqueName("01_week2", taken), "01_week2_2");
    assert.equal(uniqueName("01_Other", taken), "01_Other");
  });

  it("estimates disk from duration", () => {
    assert.equal(estimateLectureBytes(0), ESTIMATE_BYTES_PER_10_MIN + ESTIMATE_BYTES_OVERHEAD);
    assert.equal(estimateLectureBytes(10 * 60_000), ESTIMATE_BYTES_PER_10_MIN + ESTIMATE_BYTES_OVERHEAD);
    assert.equal(estimateLectureBytes(11 * 60_000), 2 * ESTIMATE_BYTES_PER_10_MIN + ESTIMATE_BYTES_OVERHEAD);
  });
});

describe("chapter helpers", () => {
  it("slugs a title and names lecture folders", () => {
    assert.equal(chapterFileSlug("Week 2 · GOC", "id"), "week-2-goc");
    assert.equal(lectureDirName(3, "ABC123"), "003-lecture-ABC123");
    assert.equal(saveChapterCommand("week-2"), "npm run save-chapter -- ./chapter-week-2.json --out ./saved");
    assert.equal(lectureStatusLabel("done"), "saved");
    assert.equal(lectureStatusLabel("pending"), "missing");
    assert.equal(lectureStatusLabel("archived"), "archived");
  });

  it("keeps only playable replays", () => {
    const rows = playableReplays([
      { replayId: "REPLAY01ABCD", title: "A", durationSec: 10, playable: true, status: "replay" },
      { replayId: "LIVE01ABCDEF", title: "B", durationSec: 10, playable: true, status: "live" },
      { replayId: "UP01ABCDEFGH", title: "C", durationSec: 10, playable: false, status: "upcoming" },
      { replayId: "ARCH01ABCDEF", title: "D", durationSec: 10, playable: true, status: "archived" },
      { replayId: null, title: "E", durationSec: 10, playable: true, status: "replay" },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.title, "A");
  });

  it("builds a chapter from a week of lessons", () => {
    const c = buildChapter({
      courseId: "COURSE1",
      courseTitle: "Bonding",
      chapterId: "COURSE1-week-1",
      chapterTitle: "Week 1",
      lessons: [
        { replayId: "REPLAY01ABCD", title: "GOC", durationSec: 90, playable: true, status: "replay" },
        { replayId: "LIVE01ABCDEF", title: "Now", durationSec: 10, playable: true, status: "live" },
      ],
    });
    assert.equal(c.lectures.length, 1);
    assert.equal(c.lectures[0]?.durationMs, 90_000);
  });
});

describe("naturalLectureSort", () => {
  function rows(titles: string[]) {
    return titles.map((title, i) => ({
      lessonId: `LESSON${String(i + 1).padStart(2, "0")}ABCDEF`,
      title,
      order: i + 1,
      durationMs: 60_000,
    }));
  }

  it("orders Week 2 Probability Theory parts I / III / II", () => {
    const sorted = naturalLectureSort(
      rows(["Probability Theory - Part I", "Probability Theory - Part III", "Probability Theory - Part II"]),
    );
    assert.deepEqual(
      sorted.map((l) => l.title),
      ["Probability Theory - Part I", "Probability Theory - Part II", "Probability Theory - Part III"],
    );
    assert.deepEqual(
      sorted.map((l) => l.order),
      [1, 2, 3],
    );
  });

  it("orders Week 3 Part V/VI/VII/IV/VIII", () => {
    const sorted = naturalLectureSort(
      rows([
        "Binomial Theorem - Part V",
        "Binomial Theorem - Part VI",
        "Binomial Theorem - Part VII",
        "Binomial Theorem - Part IV",
        "Binomial Theorem - Part VIII",
      ]),
    );
    assert.deepEqual(
      sorted.map((l) => l.title.replace(/.*Part /, "Part ")),
      ["Part IV", "Part V", "Part VI", "Part VII", "Part VIII"],
    );
  });

  it("understands Arabic and Roman part numbers and Part - IV spacing", () => {
    const sorted = naturalLectureSort(
      rows(["Series - Part 03", "Series - Part I", "Series - Part - IV", "Series - Part II"]),
    );
    assert.deepEqual(
      sorted.map((l) => l.order),
      [1, 2, 3, 4],
    );
    assert.equal(sorted[0]?.title, "Series - Part I");
    assert.equal(sorted[1]?.title, "Series - Part II");
    assert.equal(sorted[2]?.title, "Series - Part 03");
    assert.equal(sorted[3]?.title, "Series - Part - IV");
  });

  it("keeps titles without a part number in their original relative position", () => {
    const sorted = naturalLectureSort(rows(["Orientation Session", "GOC", "Homework discussion"]));
    assert.deepEqual(
      sorted.map((l) => l.title),
      ["Orientation Session", "GOC", "Homework discussion"],
    );
  });

  it("sorts inside buildChapter when asked", () => {
    const c = buildChapter({
      courseId: "COURSE1",
      courseTitle: "Bonding",
      chapterId: "w2",
      chapterTitle: "Week 2",
      sortByPart: true,
      lessons: [
        { replayId: "REPLAY03ABCD", title: "Probability Theory - Part III", durationSec: 10, playable: true, status: "replay" },
        { replayId: "REPLAY01ABCD", title: "Probability Theory - Part I", durationSec: 10, playable: true, status: "replay" },
        { replayId: "REPLAY02ABCD", title: "Probability Theory - Part II", durationSec: 10, playable: true, status: "replay" },
      ],
    });
    assert.equal(c.lectures[0]?.title, "Probability Theory - Part I");
    assert.equal(c.lectures[2]?.title, "Probability Theory - Part III");
  });

  it("orders Week 4 Random Variables then Bivariate by first appearance, not alphabet", () => {
    const sorted = naturalLectureSort(
      rows([
        "Random Variables - Part IV",
        "Random Variables - Part III",
        "Random Variables - Part V",
        "Random Variables - Part VI",
        "Random Variables - Part VII",
        "Random Variables - Part VIII",
        "Bivariate Random Variables - Part I",
        "Bivariate Random Variables - Part II",
        "Bivariate Random Variables - Part III",
        "Bivariate Random Variables - Part IV",
      ]),
    );
    assert.deepEqual(
      sorted.map((l) => l.title),
      [
        "Random Variables - Part III",
        "Random Variables - Part IV",
        "Random Variables - Part V",
        "Random Variables - Part VI",
        "Random Variables - Part VII",
        "Random Variables - Part VIII",
        "Bivariate Random Variables - Part I",
        "Bivariate Random Variables - Part II",
        "Bivariate Random Variables - Part III",
        "Bivariate Random Variables - Part IV",
      ],
    );
  });

  it("orders Week 5 Random Variable IX..XIII then Bivariate Part V", () => {
    const sorted = naturalLectureSort(
      rows([
        "Random Variable - Part IX",
        "Random Variable - Part X",
        "Random Variable - Part XI",
        "Random Variable - Part XII",
        "Random Variable - Part XIII",
        "Bivariate Random Variables - Part V",
      ]),
    );
    assert.deepEqual(
      sorted.map((l) => l.title),
      [
        "Random Variable - Part IX",
        "Random Variable - Part X",
        "Random Variable - Part XI",
        "Random Variable - Part XII",
        "Random Variable - Part XIII",
        "Bivariate Random Variables - Part V",
      ],
    );
  });

  it("treats Random Variable and Random Variables as the same group", () => {
    const sorted = naturalLectureSort(
      rows([
        "Random Variable - Part IX",
        "Bivariate Random Variables - Part V",
        "Random Variables - Part VIII",
      ]),
    );
    assert.deepEqual(
      sorted.map((l) => l.title),
      [
        "Random Variables - Part VIII",
        "Random Variable - Part IX",
        "Bivariate Random Variables - Part V",
      ],
    );
  });
});

describe("unicode folder names", () => {
  it("handles Hindi, emoji-only, and a 200-character title", () => {
    const hindi = folderSlug("प्रायिकता सिद्धांत");
    assert.equal(hindi, "प्रायिकतासिद्धांत");
    assert.equal(isSafeFolderName(lectureFolderName(1, "प्रायिकता सिद्धांत")), true);
    assert.equal(folderSlug("🔥🔥"), "Untitled");
    assert.equal(isSafeFolderName(lectureFolderName(1, "🔥🔥")), true);
    const long = "अ".repeat(200);
    const slug = folderSlug(long);
    assert.ok(slug.length <= 60);
    assert.equal(isSafeFolderName(lectureFolderName(2, long)), true);
    const saved = validateSavedChapter({
      ...good(),
      format: "inkboard-chapter-saved",
      lectures: [
        { ...lecture(1), title: "प्रायिकता सिद्धांत", dir: lectureFolderName(1, "प्रायिकता सिद्धांत"), status: "done" },
        { ...lecture(2), title: "🔥", dir: lectureFolderName(2, "🔥"), status: "pending" },
      ],
    });
    assert.equal(saved.lectures[0]?.dir, "01_प्रायिकतासिद्धांत");
    assert.equal(saved.lectures[1]?.dir, "02_Untitled");
  });
});
