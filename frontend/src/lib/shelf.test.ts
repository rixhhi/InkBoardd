import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  altReplayFootnote,
  coverageRatio,
  fmtDur,
  fromCourseCaption,
  lessonStatusCaption,
  lineState,
  nextOpenIndex,
  parseClock,
  sheetsCopy,
  shelfCoverageCopy,
  shelfEmptyCopy,
  teacherShelfEmpty,
} from "@inkboard/shared/shelf";

describe("shelf lines", () => {
  it("marks near-complete or well-covered lessons as struck", () => {
    assert.equal(lineState({ watchedSec: 0, durationSec: 2400 }), "unwatched");
    assert.equal(lineState({ watchedSec: 400, durationSec: 2400 }), "resume");
    assert.equal(lineState({ watchedSec: 2390, durationSec: 2400 }), "struck");
    assert.equal(lineState({ watchedSec: 2160, durationSec: 2400 }), "struck");
    assert.equal(lineState({ watchedSec: 0, durationSec: 2400, coverage: 0.92 }), "struck");
  });

  it("points the caret at the first line that is not struck", () => {
    assert.equal(nextOpenIndex(["struck", "resume", "unwatched"]), 1);
    assert.equal(nextOpenIndex(["struck", "struck"]), -1);
    assert.equal(nextOpenIndex(["unwatched"]), 0);
  });

  it("writes empty-board copy, never a search-engine blank", () => {
    assert.equal(shelfEmptyCopy("").title, "Search classes and teachers");
    assert.equal(shelfEmptyCopy("  gate  ").title, "Nothing here for “gate”");
  });

  it("writes teacher empty copy without a catalog shrug", () => {
    assert.equal(teacherShelfEmpty("courses", { filter: "organic" }).title, "No courses match that");
    assert.match(teacherShelfEmpty("courses", { hasBatches: true }).body, /Batches/);
    assert.equal(teacherShelfEmpty("batches").title, "No batches listed");
    assert.equal(teacherShelfEmpty("free").title, "No free classes listed");
    assert.match(teacherShelfEmpty("free").body, /Courses and batches/);
    assert.doesNotMatch(teacherShelfEmpty("free").body, /Specials/);
  });

  it("parses chalk durations", () => {
    assert.equal(parseClock("1h 50m"), 6600);
    assert.equal(parseClock("42m"), 2520);
    assert.equal(parseClock(90), 90);
    assert.equal(fmtDur(2520), "42m");
    assert.equal(fmtDur(6600), "1h 50m");
    assert.equal(fmtDur(7200), "2h");
  });

  it("keeps lesson captions factual", () => {
    assert.equal(lessonStatusCaption("replay"), "");
    assert.equal(lessonStatusCaption("replay", true), "From another course");
    assert.equal(lessonStatusCaption("replay", true, 3600, "Computer Networks for ISRO"), "From Computer Networks for ISRO");
    assert.equal(fromCourseCaption("  Computer Networks for ISRO  "), "From Computer Networks for ISRO");
    assert.equal(altReplayFootnote([{ altReplay: true, fromCourse: "Computer Networks for ISRO" }]), "From Computer Networks for ISRO");
    assert.equal(
      altReplayFootnote([
        { altReplay: true, fromCourse: "Computer Networks for ISRO" },
        { altReplay: true, fromCourse: "Computer Networks for ISRO" },
      ]),
      "2 from Computer Networks for ISRO",
    );
    assert.equal(lessonStatusCaption("archived"), "Archived · notes available");
    assert.equal(
      lessonStatusCaption("archived", true, 3600, "Computer Networks for ISRO"),
      "From Computer Networks for ISRO · notes available",
    );
    assert.equal(lessonStatusCaption("unavailable", false, 5), "Did not go live");
    assert.equal(lessonStatusCaption("unavailable", false, 8940), "Did not go live");
    assert.equal(lessonStatusCaption("unavailable", false, 2556), "No replay");
    assert.doesNotMatch(lessonStatusCaption("unavailable"), /Not recorded/);
  });

  it("writes coverage and sheets as ledger lines", () => {
    assert.equal(shelfCoverageCopy(3, 10), "30% covered");
    assert.equal(shelfCoverageCopy(0, 0), "");
    assert.equal(sheetsCopy(50), "50 sheets · take them");
    assert.equal(sheetsCopy(1), "1 sheet · take them");
    assert.equal(sheetsCopy(12, 4), "12 known + 4 possible · take them");
  });

  it("merges watch-log ranges into a coverage ratio", () => {
    const ratio = coverageRatio(
      [
        { lessonId: "A", date: "2026-09-01", seconds: 10, ranges: [[0, 10]], updatedAt: "" },
        { lessonId: "A", date: "2026-09-02", seconds: 20, ranges: [[8, 30]], updatedAt: "" },
        { lessonId: "B", date: "2026-09-01", seconds: 40, ranges: [[0, 40]], updatedAt: "" },
      ],
      "A",
      100,
    );
    assert.equal(ratio, 0.3);
  });
});
