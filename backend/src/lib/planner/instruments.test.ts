import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  coverageCopy,
  daysToExamCopy,
  instrumentFigures,
  paceSentence,
  tallyCopy,
} from "@inkboard/shared/planner/instruments";

describe("pace sentence", () => {
  it("writes on pace, ahead, and behind without a status chip", () => {
    assert.equal(paceSentence({ status: "on-track", daysDelta: 0 }), "You are on pace");
    assert.equal(paceSentence({ status: "behind", daysDelta: -2 }), "Two days behind");
    assert.equal(paceSentence({ status: "ahead", daysDelta: 1 }), "One day ahead");
    assert.equal(paceSentence({ status: "behind", daysDelta: -11 }), "11 days behind");
  });
});

describe("instrument figures", () => {
  it("keeps four numbers: tally, minutes, coverage, days to exam", () => {
    const fig = instrumentFigures({
      streak: 5,
      minutes: 130,
      coverage: 42.4,
      examDate: "2026-10-04",
      today: "2026-09-30",
    });
    assert.deepEqual(fig, { tally: 5, minutes: 130, coverage: 42, daysToExam: 4 });
    assert.equal(tallyCopy(5), "5-day streak");
    assert.equal(tallyCopy(0), "No streak");
    assert.equal(coverageCopy(2, 5), "40% struck");
    assert.equal(daysToExamCopy(4), "Four days");
    assert.equal(daysToExamCopy(0), "Exam today");
    assert.equal(daysToExamCopy(null), "No exam date");
  });
});

describe("instrument surfaces", () => {
  it("Dashboard renders the pace sentence, the minutes chart and coverage", () => {
    const src = readFileSync(new URL("../../../../frontend/src/components/planner/dashboard-page.tsx", import.meta.url), "utf8");
    assert.match(src, /paceSentence/);
    assert.match(src, /LineChart/);
    assert.match(src, /Coverage/);
  });

  it("Analytics renders the minutes line chart", () => {
    const src = readFileSync(new URL("../../../../frontend/src/pages/planner-analytics-page.tsx", import.meta.url), "utf8");
    assert.match(src, /LineChart/);
  });

  it("History is a vertical ledger of days that opens the month board", () => {
    const src = readFileSync(new URL("../../../../frontend/src/components/planner/history-page.tsx", import.meta.url), "utf8");
    assert.match(src, /historyDayLine/);
    assert.match(src, /search=\{\{ day/);
  });

  it("Journal is gone — no route, page or nav entry survives", () => {
    const root = new URL("../../../../frontend/src/", import.meta.url);
    assert.equal(existsSync(new URL("pages/planner-journal-page.tsx", root)), false);
    assert.equal(existsSync(new URL("routes/planner.journal.tsx", root)), false);
    const shell = readFileSync(new URL("components/planner/planner-shell.tsx", root), "utf8");
    assert.doesNotMatch(shell, /journal/i);
  });

  it("Wizard counts steps and publishes its form ledger", () => {
    const src = readFileSync(new URL("../../../../frontend/src/components/planner/wizard-page.tsx", import.meta.url), "utf8");
    assert.match(src, /of 4/);
    assert.match(src, /publishFormLedger/);
  });

  it("Settings publishes its form ledger", () => {
    const src = readFileSync(new URL("../../../../frontend/src/components/planner/settings-page.tsx", import.meta.url), "utf8");
    assert.match(src, /publishFormLedger/);
  });
});
