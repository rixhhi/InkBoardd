import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { csvFilename, defaultHistoryFilter, filterHistory, historyCsvExport, windowedRows, type HistoryRow } from "@inkboard/shared/planner/history";
import { progressCardPalette, progressCardStats, shareProgressCard } from "@inkboard/shared/planner/progress-card";
import { topicCoverage, unavailableCopy } from "@inkboard/shared/planner/syllabus";
import { fillPlan, fillPrefs, fillTask } from "@inkboard/shared/planner/types";

function session(over: Partial<HistoryRow> & { id: string }): HistoryRow {
  return {
    date: "2026-03-04",
    startIso: "2026-03-04T10:00:00.000Z",
    durationMin: 40,
    subject: "Physics",
    courseId: "c1",
    taskId: "t1",
    lessonId: "L1",
    notes: "",
    source: "watch",
    completed: true,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    teacher: "AG",
    lecture: "Ray optics",
    plannedDate: null,
    late: false,
    ...over,
  };
}

describe("round 2 phase 3", () => {
  it("progress card palettes differ for light vs dark and Share is wired", () => {
    const dark = progressCardPalette("dark");
    const light = progressCardPalette("light");
    assert.notEqual(dark.bg, light.bg);
    assert.equal(dark.primary, "#8fbfa8");
    assert.equal(light.primary, "#2f6b52");
    const stats = progressCardStats(
      fillPlan({
        id: "p",
        examId: "g",
        examName: "GATE CS",
        name: "GATE CS · Ankit",
        prefs: fillPrefs(),
        tasks: [
          fillTask({ id: "a", type: "lesson", status: "done" }),
          fillTask({ id: "b", type: "lesson", status: "pending" }),
        ],
      }),
      4,
      120,
    );
    assert.equal(stats.hours, 2);
    assert.equal(stats.lecturesDone, 1);
    assert.equal(stats.lecturesTotal, 2);
    const dash = readFileSync(new URL("../../../../frontend/src/components/planner/dashboard-page.tsx", import.meta.url), "utf8");
    assert.match(dash, /shareProgressCard\(card\)/);
    assert.match(dash, /Progress card downloaded/);
    assert.match(dash, /Progress card shared/);
    assert.equal(typeof shareProgressCard, "function");
  });

  it("topic coverage uses real topics and never fakes 0% for a course with none", () => {
    const withTopic = fillPlan({
      id: "p",
      examId: "g",
      prefs: fillPrefs({ lecturesPerDay: 3 }),
      courses: [
        {
          courseId: "toc",
          title: "Theory of Computation",
          teacher: "Ankit",
          subject: "CS",
          topics: [{ uid: "toc", name: "Theory of Computation" }],
          lessons: [
            { lessonId: "L1", title: "DFA", durationSec: 1200, rank: 1, week: null, notesUrl: null, dppUrl: null, playable: true, topic: "Theory of Computation" },
            { lessonId: "L2", title: "PDA", durationSec: 1200, rank: 2, week: null, notesUrl: null, dppUrl: null, playable: true, topic: "Theory of Computation" },
          ],
        },
        {
          courseId: "calc",
          title: "Calculus – I",
          teacher: "Rawtiya",
          subject: "Maths",
          topics: [],
          lessons: [{ lessonId: "C1", title: "Limits", durationSec: 900, rank: 1, week: null, notesUrl: null, dppUrl: null, playable: true }],
        },
        {
          courseId: "os",
          title: "Operating Systems",
          teacher: "Ankit",
          subject: "CS",
          topics: [
            { uid: "sync", name: "Synchronization" },
            { uid: "mem", name: "Memory" },
          ],
          lessons: [{ lessonId: "O1", title: "Intro", durationSec: 900, rank: 1, week: null, notesUrl: null, dppUrl: null, playable: true }],
        },
      ],
      tasks: [
        fillTask({ id: "a", type: "lesson", lessonId: "L1", courseId: "toc", status: "done", subject: "CS" }),
        fillTask({ id: "b", type: "lesson", lessonId: "L2", courseId: "toc", status: "pending", subject: "CS" }),
        fillTask({ id: "c", type: "lesson", lessonId: "C1", courseId: "calc", status: "pending", subject: "Maths" }),
        fillTask({ id: "d", type: "lesson", lessonId: "O1", courseId: "os", status: "pending", subject: "CS" }),
      ],
    });
    const rows = topicCoverage(withTopic, "2026-03-04");
    const toc = rows.find((r) => r.kind === "topic");
    const missing = rows.filter((r) => r.kind === "unavailable");
    assert.equal(toc?.kind, "topic");
    if (toc?.kind === "topic") {
      assert.equal(toc.topic, "Theory of Computation");
      assert.equal(toc.planned, 2);
      assert.equal(toc.studied, 1);
    }
    assert.equal(missing.length, 2);
    const calc = missing.find((r) => r.kind === "unavailable" && r.courseTitle.includes("Calculus"));
    const os = missing.find((r) => r.kind === "unavailable" && r.courseTitle.includes("Operating"));
    assert.equal(calc?.kind, "unavailable");
    if (calc?.kind === "unavailable") {
      assert.equal(calc.reason, "no-topics");
      assert.match(unavailableCopy(calc.reason, calc.courseTitle), /no topic list/);
    }
    assert.equal(os?.kind, "unavailable");
    if (os?.kind === "unavailable") assert.equal(os.reason, "untagged");
  });

  it("History CSV matches the applied subject + search filter, not the on-screen page", () => {
    const rows = [
      session({ id: "a", subject: "Physics", lecture: "Ray optics", notes: "snell" }),
      session({ id: "b", subject: "Chemistry", lecture: "Haloalkanes", notes: "optics mention" }),
      session({ id: "c", subject: "Physics", lecture: "Waves", notes: "" }),
      ...Array.from({ length: 90 }, (_, i) =>
        session({ id: `p${i}`, subject: "Physics", lecture: `Optics lab ${i}`, notes: "optics", startIso: `2026-03-04T11:${String(i % 60).padStart(2, "0")}:00.000Z` }),
      ),
    ];
    const filter = { ...defaultHistoryFilter("2026-03-04"), subject: "Physics", query: "optics" };
    const hit = filterHistory(rows, filter);
    const page = windowedRows(hit, 0, 80);
    const exported = historyCsvExport(hit, filter);
    assert.equal(hit.length, 91);
    assert.equal(page.slice.length, 80);
    assert.equal(exported.csv.split("\n").length - 1, 91);
    assert.match(exported.csv, /Ray optics/);
    assert.doesNotMatch(exported.csv, /Haloalkanes/);
    assert.doesNotMatch(exported.csv, /Waves/);
    assert.equal(exported.filename, "inkboard-history-physics-optics.csv");
    assert.equal(csvFilename(filter), exported.filename);
    const hist = readFileSync(new URL("../../../../frontend/src/components/planner/history-page.tsx", import.meta.url), "utf8");
    assert.match(hist, /historyCsvExport\(rows, filter\)/);
    assert.doesNotMatch(hist, /historyCsvExport\(windowed/);
  });
});
