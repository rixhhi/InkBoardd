/**
 * Pixel-diff two screenshot folders and write a report people can act on.
 *
 *   node scripts/visual-diff.mjs <baselineDir> <currentDir> [outDir]
 *
 * Baseline is normally main's last green `e2e-shots` artifact; current is this
 * run's. For every PNG present in both, pixelmatch counts changed pixels and a
 * diff image lands in <outDir>. Pages whose size changed are compared on the
 * shared area and flagged `resized`. Pages only in one folder are `new`/`gone`.
 *
 * Warn-only by default: a UI change is supposed to change pixels. The point is
 * that the job summary lists which pages moved and by how much, so review is
 * "open these three diffs", not "eyeball 68 PNGs". VISUAL_STRICT=1 turns any
 * change into a non-zero exit. VISUAL_SCOPE (comma list of substrings, default
 * "-member-,-login") picks which shots count; admin pages carry real-time
 * stamps ("Added Oct 29") that drift daily and would only add noise.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const [baseDir, curDir, outDir = "visual-diff"] = process.argv.slice(2);
if (!baseDir || !curDir) {
  console.error("usage: node scripts/visual-diff.mjs <baselineDir> <currentDir> [outDir]");
  process.exit(2);
}
const NOISE = Number(process.env.VISUAL_NOISE ?? 0.0005); // 0.05% of pixels: anti-aliasing floor
const STRICT = process.env.VISUAL_STRICT === "1";
const SCOPE = (process.env.VISUAL_SCOPE ?? "-member-,-login").split(",").filter(Boolean);
const inScope = (name) => !SCOPE.length || SCOPE.some((s) => name.includes(s));

const list = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".png") && !f.includes("-FAILED") && inScope(f))
        .sort()
    : [];

const baseline = new Set(list(baseDir));
const current = new Set(list(curDir));
mkdirSync(outDir, { recursive: true });

/** Top-left crop so two differently sized pages can still be compared on what they share. */
function crop(img, w, h) {
  if (img.width === w && img.height === h) return img;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) img.data.copy(out.data, y * w * 4, y * img.width * 4, y * img.width * 4 + w * 4);
  return out;
}

const rows = [];
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(2) : "0.00");

for (const f of current) {
  if (!baseline.has(f)) {
    rows.push({ name: f, status: "new", changed: 0, ratio: 0, note: "no baseline" });
    continue;
  }
  const a = PNG.sync.read(readFileSync(join(baseDir, f)));
  const b = PNG.sync.read(readFileSync(join(curDir, f)));
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const diff = new PNG({ width: w, height: h });
  const changed = pixelmatch(crop(a, w, h).data, crop(b, w, h).data, diff.data, w, h, { threshold: 0.1, includeAA: false });
  const ratio = changed / (w * h);
  const resized = a.width !== b.width || a.height !== b.height;
  const status = resized ? "resized" : ratio > NOISE ? "changed" : "same";
  const note = resized ? `${a.width}×${a.height} → ${b.width}×${b.height}` : "";
  if (status !== "same") writeFileSync(join(outDir, f.replace(/\.png$/, ".diff.png")), PNG.sync.write(diff));
  rows.push({ name: f, status, changed, ratio, note, pixels: w * h });
}
for (const f of baseline) if (!current.has(f)) rows.push({ name: f, status: "gone", changed: 0, ratio: 0, note: "in baseline only" });

const order = { resized: 0, changed: 1, new: 2, gone: 3, same: 4 };
rows.sort((x, y) => order[x.status] - order[y.status] || y.ratio - x.ratio || x.name.localeCompare(y.name));

const moved = rows.filter((r) => r.status === "changed" || r.status === "resized");
const compared = rows.filter((r) => r.status !== "gone" && r.status !== "new").length;
const lines = [`### Visual diff vs main — ${moved.length} of ${compared} pages moved`, ""];
if (!baseline.size) {
  lines.push("_No baseline (main has no green e2e artifact yet, or the download failed). Nothing compared._");
} else {
  lines.push("| Page | Status | Changed | Note |", "|---|---|---:|---|");
  for (const r of rows) {
    if (r.status === "same") continue;
    const changed = r.status === "changed" || r.status === "resized" ? `${pct(r.changed, r.pixels)}%` : "—";
    lines.push(`| \`${basename(r.name, ".png")}\` | ${r.status} | ${changed} | ${r.note} |`);
  }
  if (!rows.some((r) => r.status !== "same")) lines.push("| — | all same | — | |");
  lines.push("", `${rows.filter((r) => r.status === "same").length} unchanged · diff images in the \`e2e-shots\` artifact under \`visual/\` (changed pixels in red).`);
}
const report = lines.join("\n");
console.log(report);
writeFileSync(join(outDir, "report.md"), `${report}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n\n`);

if (STRICT && moved.length) {
  console.error(`VISUAL_STRICT: ${moved.length} page(s) changed`);
  process.exit(1);
}
