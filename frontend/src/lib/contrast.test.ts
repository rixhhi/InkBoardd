import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readStyles } from "./read-styles.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const r = srgb[0] ?? 0;
  const g = srgb[1] ?? 0;
  const b = srgb[2] ?? 0;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const L1 = lum(a);
  const L2 = lum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function token(css: string, name: string) {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m?.[1], `missing --color-${name}`);
  return m[1];
}

function block(css: string, sel: string) {
  const i = css.indexOf(sel);
  assert.ok(i >= 0, `missing ${sel}`);
  const start = css.indexOf("{", i);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

function publicFile(name: string) {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of ["../../public", "../../../public"]) {
    const path = join(here, rel, name);
    if (existsSync(path)) return path;
  }
  throw new Error(`missing public/${name}`);
}

function assertAa(css: string, label: string) {
  const bg = token(css, "bg");
  const surface = token(css, "surface");
  const elevated = token(css, "elevated");
  const faint = token(css, "faint");
  const muted = token(css, "muted");
  const border = token(css, "border");
  const fg = token(css, "fg");
  const primary = token(css, "primary");
  const primaryFg = token(css, "primary-fg");
  const accent = token(css, "accent");
  const warn = token(css, "warn");
  const danger = token(css, "danger");

  const ok = token(css, "ok");
  const paper = token(css, "paper");
  const paperInk = token(css, "paper-ink");
  const chip = token(css, "chip");

  for (const [name, ink, paperTone] of [
    ["faint/bg", faint, bg],
    ["faint/surface", faint, surface],
    ["faint/elevated", faint, elevated],
    ["faint/chip", faint, chip],
    ["muted/bg", muted, bg],
    ["muted/surface", muted, surface],
    ["muted/elevated", muted, elevated],
    ["fg/bg", fg, bg],
    ["fg/surface", fg, surface],
    ["fg/elevated", fg, elevated],
    ["accent/bg", accent, bg],
    ["accent/surface", accent, surface],
    ["accent/elevated", accent, elevated],
    ["warn/bg", warn, bg],
    ["warn/surface", warn, surface],
    ["warn/elevated", warn, elevated],
    ["danger/bg", danger, bg],
    ["danger/surface", danger, surface],
    ["danger/elevated", danger, elevated],
    ["ok/bg", ok, bg],
    ["ok/surface", ok, surface],
    ["ok/elevated", ok, elevated],
    ["primary/bg", primary, bg],
    ["paper-ink/paper", paperInk, paper],
  ] as const) {
    assert.ok(contrast(ink, paperTone) >= 4.5, `${label} ${name} ${contrast(ink, paperTone).toFixed(2)}:1`);
  }
  assert.ok(contrast(muted, bg) > contrast(faint, bg) * 1.08, `${label} muted vs faint`);
  assert.notEqual(primary.toLowerCase(), accent.toLowerCase());
  assert.ok(contrast(primaryFg, primary) >= 4.5, `${label} primary-fg ${contrast(primaryFg, primary).toFixed(2)}:1`);
  assert.ok(contrast(border, bg) >= 3, `${label} border/bg ${contrast(border, bg).toFixed(2)}:1`);
  assert.ok(contrast(border, surface) >= 3, `${label} border/surface`);
  assert.ok(contrast(border, elevated) >= 3, `${label} border/elevated`);
}

describe("design token contrast", () => {
  const css = readStyles(new URL("../styles.css", import.meta.url));
  const dark = css.slice(0, css.indexOf('html[data-theme="light"]'));
  const light = block(css, 'html[data-theme="light"]');

  it("keeps body copy at WCAG AA on dark surfaces", () => {
    assertAa(dark, "dark");
  });

  it("keeps body copy at WCAG AA on light surfaces", () => {
    assertAa(light, "light");
  });

  it("keeps subject solids readable on both themes", () => {
    const ids = ["physics", "chemistry", "maths", "biology", "cs", "english", "reasoning", "other"];
    for (const [label, sheet] of [
      ["dark", dark],
      ["light", light],
    ] as const) {
      const bg = token(sheet, "bg");
      const surface = token(sheet, "surface");
      for (const id of ids) {
        const ink = token(sheet, `sub-${id}`);
        assert.ok(contrast(ink, bg) >= 4.5, `${label} ${id}/bg ${contrast(ink, bg).toFixed(2)}:1`);
        assert.ok(contrast(ink, surface) >= 4.5, `${label} ${id}/surface ${contrast(ink, surface).toFixed(2)}:1`);
        const elevated = token(sheet, "elevated");
        assert.ok(contrast(ink, elevated) >= 4.5, `${label} ${id}/elevated ${contrast(ink, elevated).toFixed(2)}:1`);
      }
    }
  });

  it("defines line tokens and a light theme block", () => {
    assert.match(css, /--color-line:/);
    assert.match(css, /--color-line-strong:/);
    assert.match(css, /html\[data-theme="light"\]/);
    assert.match(css, /\.planner-card/);
    assert.match(css, /\.text-display/);
  });

  it("uses Desk ivory and IBM Plex, not Unacademy green or DM Sans", () => {
    assert.doesNotMatch(css, /#08bd80/i);
    assert.doesNotMatch(css, /DM Sans/);
    assert.match(css, /IBM Plex Sans/);
    assert.equal(token(dark, "primary").toLowerCase(), "#d9d4c8");
    assert.equal(token(light, "primary").toLowerCase(), "#3d3f48");
    // Shell geometry lives in tokens, not bespoke desk-* selectors.
    assert.match(css, /--sidebar-w:/);
    assert.match(css, /--header-h:/);
    assert.match(css, /--content-max:/);
    assert.match(css, /--color-paper:/);
    const favicon = readFileSync(publicFile("favicon.svg"), "utf8");
    assert.doesNotMatch(favicon, /#08bd80/i);
    assert.match(favicon, /#0e0f12/);
    assert.match(favicon, /#d9d4c8/);
  });
});
