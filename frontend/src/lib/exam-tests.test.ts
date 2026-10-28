import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function src(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("Tests plate on the exam wall", () => {
  it("faces Tests as a plate and lists series, not a quiz player", () => {
    const hub = src("../components/exam-hub.tsx");
    assert.match(hub, /loadExamTests/);
    assert.match(hub, /loadTestSeriesItems/);
    assert.match(hub, /COPY\.tests/);
    assert.match(hub, /AddTestToPlan/);
    assert.doesNotMatch(hub, /iframe/);
    assert.doesNotMatch(hub, /quiz-player/);
    assert.doesNotMatch(hub, /LOADING/);
  });

  it("sits a catalog test as a mock on the Day Board", () => {
    const add = src("../components/add-to-plan.tsx");
    assert.match(add, /eventKind: "mock"/);
    assert.match(add, /COPY\.sitThisTest/);
  });
});

describe("Crash doors and struck papers", () => {
  it("puts crash batches on the wall as doors, not a quiz", () => {
    const hub = src("../components/exam-hub.tsx");
    const wall = src("../components/folio/wall.tsx");
    const ua = src("../../../backend/src/catalog/source.ts");
    assert.match(hub, /CrashDoor/);
    assert.match(hub, /crashDoors/);
    assert.match(wall, /COPY\.crash/);
    assert.match(wall, /to="\/batch\/\$batchId"/);
    assert.match(ua, /carousel_feed/);
    assert.match(ua, /parseCrashBanner/);
  });

  it("faces Papers as a struck syllabus, not Unacademy quizzes", () => {
    const hub = src("../components/exam-hub.tsx");
    assert.match(hub, /COPY\.papers/);
    assert.match(hub, /strikePapers/);
    assert.match(hub, /onPapers/);
    assert.doesNotMatch(hub, /iframe/);
  });
});
