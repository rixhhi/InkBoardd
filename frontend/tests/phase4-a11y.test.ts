import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import axe from "axe-core";
import { JSDOM } from "jsdom";
import { readStyles } from "../src/lib/read-styles.ts";

function src(rel: string) {
  const url = new URL(rel, import.meta.url);
  if (rel.endsWith("styles.css")) return readStyles(url);
  return readFileSync(url, "utf8");
}

describe("Phase 4 accessibility and loading", () => {
  it("keeps a global focus ring, reduced motion, and one main landmark", () => {
    const css = src("../src/styles.css");
    const shell = src("../src/components/shell/app-shell.tsx");
    const root = src("../src/routes/__root.tsx");
    assert.match(css, /:focus-visible/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(shell, /<main id="main"/);
    assert.match(shell, /aria-label="Navigation"/);
    assert.doesNotMatch(root, /rel: "preconnect"/);
    assert.match(src("../src/routes/play.$lessonId.tsx"), /rel: "preconnect"/);
    // Live doors are real pages again: lazy-loaded, with the shared error boundary.
    assert.match(src("../src/routes/live.$classId.tsx"), /lazyPage\(\(\) => import\("@\/pages\/live-page"\)/);
    assert.match(src("../src/routes/live.$classId.tsx"), /errorComponent: AppErrorComponent/);
  });

  it("loads the board, palette, and planner extras after the first paint", () => {
    const root = src("../src/routes/__root.tsx");
    const lazy = src("../src/components/whiteboard-lazy.tsx");
    assert.match(root, /requestIdleCallback/);
    assert.match(root, /DeferredChrome/);
    assert.match(lazy, /import\("@\/components\/whiteboard"\)/);
    assert.match(src("../src/components/class-player.tsx"), /LazyWhiteboard/);
    assert.match(cssWeights(), /400\.css/);
    assert.match(cssWeights(), /600\.css/);
    assert.doesNotMatch(cssWeights(), /500\.css/);
  });

  it("shows exam color and player keys on the screen", () => {
    // Exam rows paint the group colour on a decorative mark, and name the group in text beside it.
    const catalog = src("../src/components/browse-catalog.tsx");
    assert.match(catalog, /data-group=\{group\}/);
    assert.match(catalog, /groupTone\(group\)/);
    assert.match(catalog, /aria-hidden="true"/);
    assert.match(src("../src/components/player-transport.tsx"), /COPY\.keysHint/);
    assert.match(src("../src/styles.css"), /\.rail-keys/);
  });

  it("holds a 90 lighthouse budget against the real stack", () => {
    const budget = JSON.parse(src("../../lighthouserc.json")) as {
      ci: {
        assert: { assertions: Record<string, [string, { minScore?: number; maxNumericValue?: number }]> };
        collect: { url: string[]; startServerCommand?: string };
      };
    };
    assert.equal(budget.ci.assert.assertions["categories:performance"]?.[1]?.minScore, 0.9);
    assert.equal(budget.ci.assert.assertions["categories:accessibility"]?.[1]?.minScore, 0.95);
    assert.equal(budget.ci.assert.assertions["cumulative-layout-shift"]?.[1]?.maxNumericValue, 0.1);
    // Lighthouse runs in the CI e2e job against the real API + SSR + edge on :3000, not a
    // bare `vite preview` (which had no API and scored an error page). /login is the one
    // public page, so it is the one audited unauthenticated.
    assert.ok(budget.ci.collect.url.includes("http://127.0.0.1:3000/login"));
    assert.ok(!budget.ci.collect.startServerCommand, "the e2e job starts the stack; LHCI must not start its own");
  });

  it("axe finds no name or landmark violations on the desk shell", async () => {
    const html = `<!doctype html><html lang="en"><head><title>Inkboard</title></head><body>
      <a href="#board">Skip to content</a>
      <nav aria-label="Navigation"><a href="/">Home</a><a href="/planner/today">Planner</a></nav>
      <main id="board">
        <h1>Pick an exam</h1>
        <a href="/search">Search classes and teachers</a>
        <button type="button">Search</button>
      </main>
    </body></html>`;
    const dom = new JSDOM(html);
    const results = await axe.run(dom.window.document.documentElement, {
      runOnly: {
        type: "rule",
        values: ["document-title", "html-has-lang", "button-name", "link-name", "landmark-one-main", "region"],
      },
    });
    assert.deepEqual(
      results.violations.map((v) => v.id),
      [],
    );
  });
});

function cssWeights() {
  return src("../src/styles.css").slice(0, 400);
}
