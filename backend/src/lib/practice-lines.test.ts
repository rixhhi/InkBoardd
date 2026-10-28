import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  parsePracticeCard,
  parsePracticePage,
  practiceCaption,
  practiceMinutes,
  practicePageUrl,
  practicePlateCaption,
} from "@inkboard/shared/practice-lines";

const GATE_CARD = {
  classDetails: {
    className: "2022 GATE Exam Questions solved + Practice Questions",
    topicGroupName: "CS & IT",
  },
  educatorDetails: { firstName: "Bharat", lastName: "Acharya" },
  totalQuizAttempts: "1K attempted",
  uid: "C96GXYO0JB",
  numQuestions: 20,
  sessionDetails: { numQuestions: 20 },
  type: 3,
};

describe("practice lines", () => {
  it("parses a DPP card and always labels the quiz locked", () => {
    const line = parsePracticeCard(GATE_CARD, true);
    assert.equal(line?.uid, "C96GXYO0JB");
    assert.equal(line?.educator, "Bharat Acharya");
    assert.equal(line?.questions, 20);
    assert.equal(practiceCaption(line!), "Bharat Acharya · 20 Q · locked");
    assert.equal(practiceMinutes(20), 20);
    assert.equal(practicePlateCaption(1), "1 DPP");
    assert.equal(practicePlateCaption(10), "10 DPPs");
    assert.match(practicePageUrl("gate-csit-dsai-interview-preparation", "NVLIA"), /\/NVLIA\/practice$/);
  });

  it("reads dppCards from a Next.js practice page", () => {
    const page = parsePracticePage({
      props: {
        pageProps: {
          goalInfo: { isPracticeAvailable: true, isFreeUnavailable: true },
          practicesByEducators: { dppCards: [GATE_CARD, { uid: "bad" }] },
        },
      },
    });
    assert.equal(page.locked, true);
    assert.equal(page.lines.length, 1);
    assert.equal(page.lines[0]?.title.includes("2022 GATE"), true);
  });

  it("drops junk cards and de-dupes", () => {
    assert.equal(parsePracticeCard({ uid: "xx", classDetails: { className: "Hi" } }, false), null);
    const page = parsePracticePage({
      props: {
        pageProps: {
          goalInfo: {},
          practicesByEducators: { dppCards: [GATE_CARD, GATE_CARD] },
        },
      },
    });
    assert.equal(page.lines.length, 1);
  });
});

describe("Practice plate on the exam wall", () => {
  it("lists DPP lines, not a quiz player", () => {
    const hub = readFileSync(new URL("../../../frontend/src/components/exam-hub.tsx", import.meta.url), "utf8");
    assert.match(hub, /loadExamPractice/);
    assert.match(hub, /COPY\.practice/);
    assert.match(hub, /AddPracticeToPlan/);
    assert.doesNotMatch(hub, /iframe/);
    assert.doesNotMatch(hub, /quiz-player/);
  });
});
