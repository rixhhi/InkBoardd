import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyRelatedReplays, htmlLessonBundle, titleScore } from "@inkboard/shared/parse-lesson";

describe("course HTML lesson merge", () => {
  it("reads replay ids from the course page lesson list, not the empty collection liveClass", () => {
    const bundle = htmlLessonBundle({
      lessonListFallbackData: {
        count: 2,
        next: null,
        results: [
          {
            value: {
              uid: "LR79TXC7",
              title: "Computer Networks - Part I",
              liveClass: { state: 0, videoDuration: 8940 },
            },
          },
          {
            value: {
              uid: "9MQ2B8SY",
              title: "Computer Networks - Part III",
              liveClass: {
                state: 20,
                videoDuration: 6556,
                videoUrl:
                  "https://player.uacdn.net/liveweb/v4036/index.html?replay=true&uid=I98Q2RWURJR6AK87BC69",
              },
            },
          },
        ],
      },
    });
    assert.equal(bundle.lessons.length, 2);
    assert.equal(bundle.complete, true);
    const part1 = bundle.lessons.find((l) => l.uid === "LR79TXC7");
    const part3 = bundle.lessons.find((l) => l.uid === "9MQ2B8SY");
    assert.equal(part1?.replayId, null);
    assert.equal(part1?.status, "unavailable");
    assert.equal(part3?.replayId, "I98Q2RWURJR6AK87BC69");
    assert.equal(part3?.playable, true);
    assert.equal(part3?.status, "replay");
  });

  it("fills a missing LT part from the ISRO series with the same part number", () => {
    const lessons = applyRelatedReplays(
      [
        {
          uid: "LT1",
          title: "Computer Networks - Part I",
          slug: "",
          durationSec: 8940,
          liveAt: "2026-02-18T14:45:00Z",
          replayId: null,
          playable: false,
          rank: 1,
          week: null,
          status: "unavailable",
          notesUrl: null,
          slidesUrl: null,
          dppUrl: null,
          dppName: null,
          thumbnail: "",
        },
        {
          uid: "LT3",
          title: "Computer Networks - Part III",
          slug: "",
          durationSec: 6556,
          liveAt: null,
          replayId: "I98Q2RWURJR6AK87BC69",
          playable: true,
          rank: 3,
          week: null,
          status: "replay",
          notesUrl: null,
          slidesUrl: null,
          dppUrl: null,
          dppName: null,
          thumbnail: "",
        },
      ],
      [
        {
          replayId: "OLP1VMYST9268CI7AW48",
          notesUrl: null,
          slidesUrl: null,
          durationSec: 3600,
          title: "Computer Networks-Part I",
          courseName: "Computer Networks for ISRO",
        },
        {
          replayId: "VI57CSB79MS6G12D7KZ7",
          notesUrl: null,
          slidesUrl: null,
          durationSec: 3600,
          title: "Computer Networks-Part III",
        },
      ],
    );
    assert.equal(lessons[0]?.replayId, "OLP1VMYST9268CI7AW48");
    assert.equal(lessons[0]?.altReplay, true);
    assert.equal(lessons[0]?.fromCourse, "Computer Networks for ISRO");
    assert.equal(lessons[0]?.status, "replay");
    assert.equal(lessons[1]?.replayId, "I98Q2RWURJR6AK87BC69");
    assert.equal(lessons[1]?.altReplay, undefined);
  });

  it("fills several missing LT parts from ISRO without mixing part numbers", () => {
    const pool = [1, 2, 5, 6, 12, 13, 17, 18].map((n) => ({
      replayId: `ISRO${n}`,
      notesUrl: null,
      slidesUrl: null,
      durationSec: 3600,
      title: `Computer Networks-Part ${n === 1 ? "I" : n === 2 ? "II" : n === 5 ? "V" : n === 6 ? "VI" : n === 12 ? "XII" : n === 13 ? "XIII" : n === 17 ? "XVII" : "XVIII"}`,
    }));
    const lessons = applyRelatedReplays(
      [
        { uid: "a", title: "Computer Networks - Part I", slug: "", durationSec: 8940, liveAt: null, replayId: null, playable: false, rank: 1, week: null, status: "unavailable", notesUrl: null, slidesUrl: null, dppUrl: null, dppName: null, thumbnail: "" },
        { uid: "b", title: "Computer Networks - Part II", slug: "", durationSec: 5, liveAt: null, replayId: null, playable: false, rank: 2, week: null, status: "unavailable", notesUrl: null, slidesUrl: null, dppUrl: null, dppName: null, thumbnail: "" },
        { uid: "c", title: "Computer Networks - Part III", slug: "", durationSec: 6556, liveAt: null, replayId: "OWN3", playable: true, rank: 3, week: null, status: "replay", notesUrl: null, slidesUrl: null, dppUrl: null, dppName: null, thumbnail: "" },
        { uid: "d", title: "Computer Networks - Part XVIII", slug: "", durationSec: 2556, liveAt: null, replayId: null, playable: false, rank: 18, week: null, status: "unavailable", notesUrl: null, slidesUrl: null, dppUrl: null, dppName: null, thumbnail: "" },
      ],
      pool,
    );
    assert.equal(lessons[0]?.replayId, "ISRO1");
    assert.equal(lessons[1]?.replayId, "ISRO2");
    assert.equal(lessons[2]?.replayId, "OWN3");
    assert.equal(lessons[3]?.replayId, "ISRO18");
  });

  it("scores the same part number highly and refuses a different part", () => {
    assert.ok(titleScore("computer networks part 1", "computer networks part 1") >= 90);
    assert.equal(titleScore("computer networks part 1", "computer networks part 2"), 0);
    assert.ok(titleScore("computer networks part 11", "computer networks part 11") >= 80);
  });
});
