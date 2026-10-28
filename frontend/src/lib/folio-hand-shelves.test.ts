import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ERASER_MS, STRIKE_MS, tallyGroups, tallyTickIndex } from "@inkboard/shared/hand";
import { readStyles } from "./read-styles.ts";

function src(rel: string) {
  const url = new URL(rel, import.meta.url);
  if (rel.endsWith("styles.css")) return readStyles(url);
  return readFileSync(url, "utf8");
}

describe("Patina P2 — the hand", () => {
  it("groups tally marks in fives and ticks only the new stroke", () => {
    assert.deepEqual(tallyGroups(0), []);
    assert.deepEqual(tallyGroups(4), [4]);
    assert.deepEqual(tallyGroups(5), [5]);
    assert.deepEqual(tallyGroups(6), [5, 1]);
    assert.equal(tallyTickIndex(null, 4), null);
    assert.equal(tallyTickIndex(4, 4), null);
    assert.equal(tallyTickIndex(4, 5), 4);
    assert.equal(tallyTickIndex(0, 1), 0);
  });

  it("strike draws on complete, skip-on-load, undo erases — no celebration toast", () => {
    const css = src("../styles.css");
    const shelf = src("../components/folio/shelf.tsx");
    const row = src("../components/planner/task-row.tsx");
    const tally = src("../components/folio/tally.tsx");
    const shell = src("../components/shell/app-shell.tsx");
    const hub = src("../components/exam-hub.tsx");
    const player = ["../components/class-player.tsx", "../components/player/use-playback.ts"].map(src).join("\n");
    assert.match(shelf, /function StrikeTitle/);
    assert.match(shelf, /is-ready/);
    assert.match(shelf, /is-on/);
    assert.match(row, /StrikeTitle/);
    assert.doesNotMatch(row, /Marked done/);
    assert.match(css, /strike-title\.is-ready:after/);
    assert.match(css, /240ms|--duration-strike/);
    assert.match(tally, /tallyTickIndex/);
    assert.match(tally, /tally-tick/);
    assert.match(css, /eraser-wipe/);
    assert.match(shell, /<main id="main"/);
    assert.match(shell, /pathname/);
    assert.match(hub, /key=\{faced/);
    assert.match(player, /PLAYER_IDLE_MS/);
    assert.equal(STRIKE_MS, 240);
    assert.equal(ERASER_MS, 320);
  });
});

describe("Patina P3 — shelves and one Write", () => {
  it("empty /search is a focused write field, shares with ?q= still render hits", () => {
    const search = src("../pages/search-page.tsx");
    const palette = src("../../../shared/src/lib/command-palette.ts");
    assert.match(search, /COPY\.writeWhere/);
    assert.match(search, /autoFocus/);
    assert.match(search, /usernameFromQuery/);
    assert.match(search, /usernameIfNoHits/);
    assert.match(search, /pushRecent/);
    assert.doesNotMatch(search, /openCommandPalette/);
    assert.doesNotMatch(search, /isUsernameQuery/);
    assert.doesNotMatch(search, /WriteField/);
    assert.doesNotMatch(search, /RecentSearches/);
    assert.match(palette, /openCommandPalette\(seed/);
    assert.match(search, /lookup\.data/);
  });

  it("teacher paint has no learners, course brief stays folded, batch is lined", () => {
    const teacher = src("../components/educator-catalog.tsx");
    const course = ["../pages/course-page.tsx", "../pages/course/catalog-shelf.tsx", "../pages/course/live-shelf.tsx"].map(src).join("\n");
    const batch = ["../pages/batch-page.tsx", "../pages/batch/batch-board.tsx", "../pages/batch/session-rows.tsx"].map(src).join("\n");
    // Teacher page is on the kit: `Bio` is the folded brief (line-clamp-2 with an expand toggle).
    assert.match(teacher, /<Bio text=/);
    assert.match(teacher, /line-clamp-2/);
    assert.doesNotMatch(teacher, /learners/i);
    assert.doesNotMatch(teacher, /followers/);
    assert.match(course, /<Brief /);
    assert.match(batch, /<Brief /);
    assert.match(batch, /view === "list"/);
    // Batch is on the kit: the class filter is the kit SearchInput inside a Toolbar.
    assert.match(batch, /<SearchInput/);
    assert.match(batch, /<Toolbar/);
  });
});
