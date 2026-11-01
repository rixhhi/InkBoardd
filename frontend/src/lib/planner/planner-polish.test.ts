import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStyles } from "../read-styles.ts";
import { describe, it } from "node:test";
import { chartBars, chartTip, chartXLabels } from "@inkboard/shared/planner/charts";
import { formatClock } from "@inkboard/shared/planner/daily";

describe("round 2 phase 2 polish", () => {
  it("chart tips include the exact minutes and optional goal", () => {
    const layout = chartBars([0, 40, 90], 90, ["Mon", "Tue", "Wed"]);
    assert.equal(chartTip(layout.bars[1]!, 90), "Tue · 40 min · goal 90 min");
    assert.equal(chartTip(layout.bars[2]!), "Wed · 90 min");
  });

  it("week charts keep every x label; long ranges only keep ends + middle", () => {
    assert.deepEqual(chartXLabels(["Mon", "Tue", "Wed"], 3), ["Mon", "Tue", "Wed"]);
    const days = Array.from({ length: 30 }, (_, i) => `2026-03-${String(i + 1).padStart(2, "0")}`);
    const labs = chartXLabels(days, 30);
    assert.equal(labs[0], "01");
    assert.equal(labs[29], "30");
    assert.equal(labs.filter(Boolean).length, 3);
  });

  it("12/24h clock formatting is used for reminders and queues", () => {
    assert.equal(formatClock(19 * 60, true), "7pm");
    assert.equal(formatClock(19 * 60, false), "19:00");
    const settings = readFileSync(new URL("../../components/planner/settings-page.tsx", import.meta.url), "utf8");
    assert.match(settings, /formatClock\(h \* 60, hour12\)/);
    assert.match(settings, /hourLabel\(h, profile\.hour12\)/);
    assert.match(settings, /role="status"/);
    assert.match(settings, /\bSaved\b/);
  });

  it("calendar has a colour legend, drag-and-drop, and a keyboard Move to… fallback", () => {
    const cal = readFileSync(new URL("../../components/planner/calendar-page.tsx", import.meta.url), "utf8");
    const row = readFileSync(new URL("../../components/planner/task-row.tsx", import.meta.url), "utf8");
    assert.match(cal, /aria-label="Calendar legend"/);
    assert.match(cal, /Underlined · overdue/);
    assert.match(cal, /Ringed · exam day/);
    assert.doesNotMatch(cal, /Journal/, "journal is retired");
    assert.match(cal, /max-width: 639px/);
    assert.match(cal, /setView\(mq.matches \? "agenda"/);
    assert.match(cal, /text\/task-id/);
    assert.match(row, /draggable/);
    assert.match(row, /Move to/);
  });

  it("badges celebrate a first unlock once and use the kit select", () => {
    const src = readFileSync(new URL("../../pages/planner-badges-page.tsx", import.meta.url), "utf8");
    assert.match(src, /KitSelect/);
    assert.match(src, /earnedAt\?\.startsWith\(date\)/);
    const watcher = readFileSync(new URL("../../components/planner/badge-watcher.tsx", import.meta.url), "utf8");
    assert.match(watcher, /seen\.current/);
    assert.match(watcher, /persistNewlyEarned/);
  });

  it("Today Shorten my day toasts with Undo and the ledger holds the coach line", () => {
    const today = readFileSync(new URL("../../components/planner/today-page.tsx", import.meta.url), "utf8");
    const ledger = readFileSync(new URL("../../components/folio/ledger.tsx", import.meta.url), "utf8");
    assert.match(today, /toast\.success\(short\.reason, \{ action: \{ label: "Undo"/);
    assert.match(ledger, /coach\.reason/);
    assert.match(ledger, /openBoardSession/);
  });

  it("danger-zone delete still requires typing DELETE and a recovery point", () => {
    const src = readFileSync(new URL("../../components/planner/settings-page.tsx", import.meta.url), "utf8");
    assert.match(src, /resetTyped !== "DELETE"/);
    assert.match(src, /createRecoveryPoint\("reset workspace"/);
    assert.match(src, /No plan yet/);
  });

  it("press and reduced-motion tokens cover kit buttons and badge shimmer", () => {
    const css = readStyles(new URL("../../styles.css", import.meta.url));
    assert.match(css, /transform:\s*scale\(0\.98\)/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    // Badges no longer shimmer; the planner kit presses with a transform the reduced-motion block neutralises.
    assert.doesNotMatch(css, /badge-shimmer/);
    const kit = readFileSync(new URL("../../components/ui/planner/kit.tsx", import.meta.url), "utf8");
    assert.match(kit, /<button/);
    assert.match(kit, /active:scale-\[0\.98\]/);
  });

  it("secondary planner pages keep skip-link, kit selects, and Kalam inscriptions", () => {
    const shell = readFileSync(new URL("../../components/planner/planner-shell.tsx", import.meta.url), "utf8");
    assert.match(shell, /id="planner-main"/);
    assert.match(shell, /<AppShell>/);
    const history = readFileSync(new URL("../../components/planner/history-page.tsx", import.meta.url), "utf8");
    const analytics = readFileSync(new URL("../../pages/planner-analytics-page.tsx", import.meta.url), "utf8");
    const calendar = readFileSync(new URL("../../components/planner/calendar-page.tsx", import.meta.url), "utf8");
    const dashboard = readFileSync(new URL("../../components/planner/dashboard-page.tsx", import.meta.url), "utf8");
    assert.match(history, /historyDayLine/);
    assert.match(history, /KitSelect/);
    assert.match(history, /EmptyPanel/);
    assert.match(analytics, /LineChart/);
    assert.match(analytics, /Weekday pattern/);
    assert.match(analytics, /Session length/);
    assert.match(calendar, /mini-board|MiniBoard/);
    assert.match(dashboard, /paceSentence/);
  });

  it("a11y: charts, calendar legend, and skip-link are labelled (not colour-only)", () => {
    const kit = readFileSync(new URL("../../components/ui/planner/kit.tsx", import.meta.url), "utf8");
    const cal = readFileSync(new URL("../../components/planner/calendar-page.tsx", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../../components/planner/planner-shell.tsx", import.meta.url), "utf8");
    assert.match(kit, /role="img"/);
    assert.match(kit, /aria-label=\{`Minutes per day/);
    assert.match(kit, /Dashed line · \{layout.goal\} min goal/);
    assert.match(cal, /aria-label="Calendar legend"/);
    assert.match(cal, /Done/);
    assert.match(cal, /Underlined · overdue/);
    assert.match(cal, /Hatched · minutes studied/);
    assert.match(shell, /WidgetErrorBoundary/);
    const skip = readFileSync(new URL("../../components/folio/skip-link.tsx", import.meta.url), "utf8");
    assert.match(skip, /COPY.skipToBoard/);
    const app = readFileSync(new URL("../../components/shell/app-shell.tsx", import.meta.url), "utf8");
    const sheet = readFileSync(new URL("../../components/folio/saved-sheet.tsx", import.meta.url), "utf8");
    assert.match(sheet, /aria-label="Saved"/);
    assert.match(app, /<main id="main"/);
  });
});
