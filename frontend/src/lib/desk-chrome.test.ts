import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readStyles } from "./read-styles.ts";

function src(rel: string) {
  const url = new URL(rel, import.meta.url);
  if (rel.endsWith("styles.css")) return readStyles(url);
  return readFileSync(url, "utf8");
}

describe("Desk chrome source contract", () => {
  it("nav uses Lucide icons and the five labelled destinations", () => {
    const nav = src("../lib/nav.ts");
    const shell = src("../components/shell/app-shell.tsx");
    assert.match(nav, /from "lucide-react"/);
    for (const icon of ["House", "Compass", "Library", "Radio", "CalendarDays"]) assert.match(nav, new RegExp(icon));
    for (const label of ["Home", "Browse", "Library", "Live", "Planner"]) assert.match(nav, new RegExp(`label: "${label}"`));
    assert.doesNotMatch(shell, /<svg viewBox/);
    // One sidebar, one phone tab bar, one context bar — each a named landmark.
    assert.match(shell, /aria-label="Primary"/);
    assert.match(shell, /aria-label="Navigation"/);
    assert.match(shell, /aria-label="You are here"/);
  });

  it("the player stays full-bleed", () => {
    const play = src("../pages/play-page.tsx");
    assert.match(play, /ClassPlayer/);
    assert.doesNotMatch(play, /createServerFn/);
  });

  it("home is exam-first, not a question hero", () => {
    const home = src("../pages/home-page.tsx");
    assert.match(home, /Pick an exam/);
    assert.match(home, /ContinueCard/);
    assert.doesNotMatch(home, /What are you studying/);
    assert.doesNotMatch(home, /createServerFn/);
  });

  it("styles use a serif for headings and a sans for the UI", () => {
    const css = src("../styles.css");
    assert.match(css, /ibm-plex-sans/);
    assert.match(css, /source-serif-4/);
    assert.match(css, /--font-serif: "Source Serif 4"/);
    assert.match(css, /--color-primary: #d9d4c8/);
    assert.match(css, /--color-accent: #1aa88e/);
    assert.match(css, /--radius-board: 12px/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /--color-bg: #0e0f12/);
    // Shell layout is driven by tokens the AppShell reads, not a .desk-root selector.
    assert.match(css, /--sidebar-w:/);
    assert.match(css, /--header-h:/);
  });
});
