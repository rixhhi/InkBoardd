import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, acc);
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith(".test.ts")) acc.push(path);
  }
  return acc;
}

describe("Patina P9 — dust", () => {
  it("leaves no FilterChip on a painted route", () => {
    const root = join(import.meta.dirname, "..");
    const hits = walk(root).filter((f) => readFileSync(f, "utf8").includes("FilterChip"));
    assert.deepEqual(hits, []);
  });

  it("keeps the share card and board mark", () => {
    const here = import.meta.dirname;
    const ogCandidates = [join(here, "../../public/og.jpg"), join(here, "../../../public/og.jpg")];
    const favCandidates = [join(here, "../../public/favicon.svg"), join(here, "../../../public/favicon.svg")];
    const og = ogCandidates.find((p) => existsSync(p));
    const fav = favCandidates.find((p) => existsSync(p));
    const site = readFileSync(join(here, "og/site.json"), "utf8");
    assert.equal(Boolean(og), true);
    assert.equal(Boolean(fav), true);
    const svg = readFileSync(fav!, "utf8");
    assert.match(svg, /#d9d4c8|#0e0f12/);
    assert.doesNotMatch(svg, /#08bd80/i);
    assert.match(site, /Inkboard/);
    assert.match(site, /board and the ink/);
  });

  it("keeps HatchChip as a leftover API, never imported onto a painted route", () => {
    const root = join(import.meta.dirname, "..");
    const hits = walk(root).filter((f) => {
      if (f.endsWith("folio/wall.tsx")) return false;
      const src = readFileSync(f, "utf8");
      return /\bHatchChip\b/.test(src);
    });
    assert.deepEqual(hits, []);
  });

  it("does not paint view counts or playlist as chrome", () => {
    const live = readFileSync(join(import.meta.dirname, "../pages/live-page.tsx"), "utf8");
    const hub = readFileSync(join(import.meta.dirname, "../components/exam-hub.tsx"), "utf8");
    const wall = readFileSync(join(import.meta.dirname, "../components/folio/wall.tsx"), "utf8");
    assert.doesNotMatch(live, /watching/);
    assert.doesNotMatch(hub, /All \d+ stamps/);
    assert.doesNotMatch(wall, /"Playlist"/);
  });

  it("keeps first sitting on Today — month and pace are a blank instrument", () => {
    const today = readFileSync(join(import.meta.dirname, "../components/planner/today-page.tsx"), "utf8");
    const month = readFileSync(join(import.meta.dirname, "../components/planner/calendar-page.tsx"), "utf8");
    const pace = readFileSync(join(import.meta.dirname, "../components/planner/dashboard-page.tsx"), "utf8");
    assert.match(today, /PlannerOnboarding/);
    assert.doesNotMatch(month, /PlannerOnboarding/);
    assert.doesNotMatch(pace, /PlannerOnboarding/);
    assert.match(month, /BlankInstrument/);
    assert.match(pace, /BlankInstrument/);
  });
});
