import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { boardRoom, folioDateParts, folioMode, formatRemain, isPlannerMode, peekCopy } from "@inkboard/shared/folio";

describe("folio", () => {
  it("maps routes onto board modes", () => {
    assert.equal(folioMode("/"), "wall");
    assert.equal(folioMode("/exam/YOTUH"), "wall");
    assert.equal(folioMode("/course/abc"), "shelf");
    assert.equal(folioMode("/teacher/pankaj"), "shelf");
    assert.equal(folioMode("/search"), "shelf");
    assert.equal(folioMode("/batch/abc"), "shelf");
    assert.equal(folioMode("/play/xyz"), "slate");
    assert.equal(folioMode("/live/xyz"), "slate");
    assert.equal(folioMode("/offline"), "slate");
    assert.equal(folioMode("/planner/today"), "day");
    assert.equal(folioMode("/planner"), "month");
    assert.equal(folioMode("/planner/dashboard"), "instrument");
    assert.equal(folioMode("/planner/badges"), "reflect");
    assert.equal(folioMode("/planner/settings"), "form");
  });

  it("keys the board by room, not every planner sub-tab", () => {
    assert.equal(boardRoom("/"), "home");
    assert.equal(boardRoom("/exam/YOTUH"), "exam");
    assert.equal(boardRoom("/planner/dashboard"), "instrument");
    assert.equal(boardRoom("/planner/analytics"), "instrument");
    assert.equal(boardRoom("/planner/history"), "instrument");
    assert.equal(boardRoom("/planner/today"), "day");
    assert.equal(boardRoom("/course/abc"), "shelf");
  });

  it("knows which modes belong to the planner", () => {
    assert.equal(isPlannerMode("day"), true);
    assert.equal(isPlannerMode("wall"), false);
  });

  it("writes remaining time in chalk, not a clock widget", () => {
    assert.equal(formatRemain(20), "20m");
    assert.equal(formatRemain(80), "1h 20m");
    assert.equal(formatRemain(120), "2h");
    assert.equal(peekCopy(3, 80, true), "3 left · pull");
    assert.equal(peekCopy(0, 0, true), "Board clear · pull");
    assert.equal(peekCopy(0, 0, false), "Blank · pull");
    assert.equal(peekCopy(0, 0, false, "JEE"), "JEE · pull");
    assert.equal(peekCopy(2, 40, true, "NEET"), "2 left · pull");
  });

  it("the ledger is a desk, not a second exam directory", () => {
    const src = readFileSync(new URL("../components/folio/ledger.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(src, /examsByGroup/);
    assert.doesNotMatch(src, /ExamCatalog/);
    assert.match(src, /showExamDesk/);
    assert.match(src, /showPlateDesk/);
    assert.match(src, /Recent/);
    assert.match(src, /sheetsCopy/);
  });

  it("splits the desk date into a seal and a line", () => {
    const parts = folioDateParts(new Date(2026, 9, 1));
    assert.equal(parts.weekday, "THURSDAY");
    assert.equal(parts.dayMonth, "1 October");
  });

  it("docks a labelled sidebar and phone tab bar instead of stretching empty paper", () => {
    const nav = readFileSync(new URL("../lib/nav.ts", import.meta.url), "utf8");
    const ledger = readFileSync(new URL("../components/folio/ledger.tsx", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../components/shell/app-shell.tsx", import.meta.url), "utf8");
    assert.match(nav, /NAV_ITEMS/);
    assert.match(nav, /lucide-react/);
    assert.match(ledger, /folioDateParts/);
    assert.doesNotMatch(ledger, />Inkboard</);
    // One shell drives both the desktop sidebar and the phone tab bar from the same list:
    // NAV_ITEMS filtered by role and member feature switches (visibleNav).
    assert.match(shell, /function Sidebar\(/);
    assert.match(shell, /function TabBar\(/);
    assert.match(nav, /export function visibleNav/);
    assert.match(nav, /NAV_ITEMS\.filter/);
    assert.equal(shell.match(/const items = useNavItems\(\)/g)?.length, 2, "sidebar and tab bar share one source");
    assert.match(shell, /items\.map\(\(item\)/);
    assert.doesNotMatch(shell, /folio-fold|folio-spine|desk-root/);
  });
});
