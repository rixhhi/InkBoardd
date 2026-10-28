import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readStyles } from "./read-styles.ts";

function src(rel: string) {
  const url = new URL(rel, import.meta.url);
  if (rel.endsWith("styles.css")) return readStyles(url);
  return readFileSync(url, "utf8");
}

describe("Phase 4 leftovers", () => {
  it("does not paint rings, donuts, or flame cards", () => {
    const kit = src("../components/ui/planner/kit.tsx");
    const css = src("../styles.css");
    assert.doesNotMatch(kit, /ProgressRing/);
    assert.doesNotMatch(kit, /export function Donut/);
    assert.doesNotMatch(kit, /flame-idle/);
    assert.doesNotMatch(css, /flame-idle/);
  });

  it("Unacademy server fns validate with zod, not any", () => {
    const ua = src("../../../backend/src/catalog/source.ts");
    assert.match(ua, /EducatorPageInput.parse/);
    assert.match(ua, /ExamHubInput.parse/);
    assert.match(ua, /ClassDetailInput.parse/);
    assert.doesNotMatch(ua, /\.validator\(\(d: any\)/);
    assert.doesNotMatch(ua, /: any/);
  });

  it("catalog HTTP client does not keep createServerFn", () => {
    const ua = src("./unacademy.ts");
    assert.match(ua, /apiJson/);
    assert.doesNotMatch(ua, /createServerFn/);
    assert.doesNotMatch(ua, /inputValidator/);
    assert.doesNotMatch(ua, /\.validator\(/);
  });

  it("catch-up respects reduced motion", () => {
    const catchup = src("../components/planner/behind-banner.tsx");
    assert.match(catchup, /prefers-reduced-motion/);
  });
});
