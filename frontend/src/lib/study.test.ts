import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boardChapters, chapterHits, chaptersToVtt, parseClockQuery, parseSilenceFile, revisionCards, revisionLines, revisionPdf, skipSilenceTo, vttClock } from "./study.ts";

describe("phase C study marks", () => {
  const timeline = {
    durationMs: 120_000,
    slides: [
      { t: 0, uid: "a" },
      { t: 40_000, uid: "b" },
    ],
    switches: [
      { t: 0, uid: "a" },
      { t: 500, uid: "a" },
      { t: 40_000, uid: "b" },
      { t: 90_000, uid: "c" },
    ],
  };

  it("keeps one tick per board change and drops near-duplicates", () => {
    const marks = boardChapters(timeline);
    assert.deepEqual(
      marks.map((m) => [m.label, m.t, m.uid]),
      [
        ["Slide 1", 0, "a"],
        ["Slide 2", 40, "b"],
        ["Slide 3", 90, "c"],
      ],
    );
  });

  it("falls back to slide timestamps when there are no switches", () => {
    const marks = boardChapters({ ...timeline, switches: [] });
    assert.equal(marks.length, 2);
    assert.equal(marks[1]?.uid, "b");
  });

  it("jumps to the end of the silence the playhead is inside", () => {
    const ranges = [
      { start: 10, end: 18 },
      { start: 40, end: 42 },
    ];
    assert.equal(skipSilenceTo(12, ranges), 18);
    assert.equal(skipSilenceTo(18, ranges), null);
    assert.equal(skipSilenceTo(3, ranges), null);
  });

  it("reads silence files and rejects inverted ranges", () => {
    assert.deepEqual(parseSilenceFile([{ start: 1, end: 4 }, { start: 8, end: 8 }]), [{ start: 1, end: 4 }]);
    assert.deepEqual(parseSilenceFile({ ranges: [{ start: 2, end: 5 }] }), [{ start: 2, end: 5 }]);
    assert.deepEqual(parseSilenceFile(null), []);
  });

  it("finds a chapter by label or clock", () => {
    const marks = boardChapters(timeline);
    assert.equal(chapterHits("slide 2", marks)[0]?.uid, "b");
    assert.equal(chapterHits("1:30", marks)[0]?.uid, "c");
    assert.equal(parseClockQuery("1:02:03"), 3723);
    assert.equal(parseClockQuery("nope"), null);
    assert.equal(chapterHits("", marks).length, 3);
  });

  it("writes chapter captions, cards, and a one-page sheet", () => {
    const marks = boardChapters(timeline);
    assert.equal(vttClock(90), "00:01:30.000");
    const vtt = chaptersToVtt(marks);
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /00:00:40\.000 --> 00:01:30\.000/);
    assert.match(vtt, /Slide 2/);
    const cards = revisionCards("Newton", marks, [{ seconds: 12, note: "ask\tthis" }]);
    assert.match(cards, /^Front\tBack/);
    assert.match(cards, /ask this\tNewton/);
    const pdf = revisionPdf(revisionLines("Newton", marks, [{ seconds: 12, note: "derive" }]));
    assert.match(pdf, /^%PDF-1\.4/);
    assert.match(pdf, /Newton/);
    assert.match(pdf, /derive/);
    assert.match(pdf, /%%EOF/);
  });
});
