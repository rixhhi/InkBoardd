import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dailyTotals, defaultHistoryFilter, filterHistory, previousPeriod, rangeBounds, sessionsToCsv, windowedRows, type HistoryRow } from "@inkboard/shared/planner/history";

function row(over: Partial<HistoryRow> & { id: string }): HistoryRow {
  return {
    date: "2026-03-04",
    startIso: "2026-03-04T10:00:00.000Z",
    durationMin: 40,
    subject: "Physics",
    courseId: "c1",
    taskId: "t1",
    lessonId: "L1",
    notes: "optics",
    source: "watch",
    completed: true,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    teacher: "AG",
    lecture: "Ray optics",
    plannedDate: "2026-03-03",
    late: true,
    ...over,
  };
}

describe("history filters", () => {
  it("filters by range, query, source and notes", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "b", date: "2026-02-01", startIso: "2026-02-01T10:00:00.000Z", lecture: "Old" }),
      row({ id: "c", notes: "", lecture: "Silent", source: "manual", completed: false }),
    ];
    const filter = { ...defaultHistoryFilter("2026-03-04"), query: "optics", source: "watch" as const };
    const hit = filterHistory(rows, filter);
    assert.equal(hit.length, 1);
    assert.equal(hit[0]!.id, "a");
    const notes = filterHistory(rows, { ...defaultHistoryFilter("2026-03-04"), hasNotes: true });
    assert.ok(notes.every((r) => r.notes.trim()));
  });

  it("exports full filtered CSV and daily totals", () => {
    const rows = [row({ id: "a" }), row({ id: "b", date: "2026-03-04", durationMin: 20, lecture: "Wave" })];
    const csv = sessionsToCsv(rows);
    assert.match(csv, /date,start,end/);
    assert.match(csv, /Ray optics/);
    assert.equal(csv.split("\n").length, 3);
    const totals = dailyTotals(rows);
    assert.equal(totals[0]!.minutes, 60);
    assert.equal(totals[0]!.count, 2);
  });

  it("builds previous equal-length period", () => {
    assert.deepEqual(previousPeriod("2026-03-01", "2026-03-07"), { from: "2026-02-22", to: "2026-02-28" });
    assert.deepEqual(rangeBounds("today", "2026-03-04"), { from: "2026-03-04", to: "2026-03-04" });
  });

  it("windows long lists without copying the rest", () => {
    const rows = Array.from({ length: 250 }, (_, i) => row({ id: `r${i}` }));
    const page = windowedRows(rows, 2, 80);
    assert.equal(page.slice.length, 80);
    assert.equal(page.pages, 4);
    assert.equal(page.slice[0]!.id, "r160");
    const last = windowedRows(rows, 99, 80);
    assert.equal(last.page, 3);
    assert.equal(last.slice.length, 10);
  });

  it("CSV of a subject + search filter contains only those rows", () => {
    const rows = [
      row({ id: "a", subject: "Physics", lecture: "Ray optics", notes: "snell" }),
      row({ id: "b", subject: "Chemistry", lecture: "Haloalkanes", notes: "optics" }),
      row({ id: "c", subject: "Physics", lecture: "Waves", notes: "sound" }),
    ];
    const filter = { ...defaultHistoryFilter("2026-03-04"), subject: "Physics", query: "optics" };
    const hit = filterHistory(rows, filter);
    assert.equal(hit.length, 1);
    assert.equal(hit[0]!.id, "a");
    const csv = sessionsToCsv(hit);
    assert.match(csv, /Ray optics/);
    assert.doesNotMatch(csv, /Haloalkanes/);
    assert.doesNotMatch(csv, /Waves/);
    assert.equal(csv.split("\n").length, 2);
  });
});
