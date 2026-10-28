import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { describeError } from "./api-client.ts";

function src(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("route chrome", () => {
  it("gives a chunk-load fallback one main and a page heading", () => {
    const fetching = src("../components/fetching.tsx");
    assert.match(fetching, /const Label = compact \? "p" : "h1"/);
    assert.match(fetching, /<DeskSkip \/>/);
    assert.match(fetching, /<main id="main"/);
    for (const file of ["../routes/-lazy-page.tsx", "../routes/planner.tsx", "../routes/offline.tsx", "../pages/play-page.tsx"]) {
      assert.match(src(file), /RouteFallback/);
    }
  });

  it("uses one heading on page-level empty shelves", () => {
    assert.match(src("../components/folio/shelf.tsx"), /heading === 1 \? "h1"/);
    // Rebuilt on the kit: ErrorState's `heading` prop renders the page h1.
    for (const file of ["../pages/course-page.tsx", "../pages/batch-page.tsx", "../pages/live-page.tsx", "../components/educator-catalog.tsx"]) {
      assert.match(src(file), /<ErrorState[\s\S]{0,200}\bheading\b/);
    }
  });

  it("confirms before a save is removed", () => {
    assert.match(src("../pages/favourites-page.tsx"), /Remove this course\?/);
    assert.match(src("../features/offline/app.tsx"), /Remove this save\?/);
    assert.doesNotMatch(src("../pages/favourites-page.tsx"), /onClick=\{\(\) => removeFavourite/);
  });

  it("does not show internal paths in catalog errors", () => {
    const leaked = describeError(new Error("explode\n    at boom (/var/tmp/ink.ts:1:1)"));
    assert.equal(leaked.kind, "other");
    assert.equal(leaked.body, "Try again.");
    assert.doesNotMatch(`${leaked.title} ${leaked.body}`, /\/var\/tmp|at boom/);
    const plain = describeError(new Error("Playlist is not a course"));
    assert.equal(plain.body, "Playlist is not a course");
  });
});
