/** Fail a production build when the shipped JavaScript crosses these caps. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";

// Measured 2026-11-01: first load 767 KB raw / 246 KB gzip (37 files; the 389 KB index chunk is
// react-dom + router + query, the floor), total 2,587 KB. Caps sit ~15% above that so a stray
// static import of hls.js / pdf.js / jszip into the shell fails CI instead of shipping.
const FIRST_LOAD = 900_000;
const TOTAL = 3_000_000;

export { FIRST_LOAD, TOTAL };

/**
 * @typedef {{ file?: string, imports?: string[], isEntry?: boolean }} ManifestEntry
 * @typedef {{ firstLoad: number, firstBudget: number, total: number, budget: number, ok?: boolean }} BudgetResult
 */

/** Walk a directory tree and sum all .js file sizes. */
/** @param {string} dir */
function sumJs(dir) {
  let total = 0;
  /** @type {import("node:fs").Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += sumJs(full);
    } else if (extname(entry.name) === ".js") {
      total += statSync(full).size;
    }
  }
  return total;
}

/**
 * @param {string} dir
 * @param {string} name
 * @param {string[]} [out]
 * @returns {string[]}
 */
function findNamed(dir, name, out = []) {
  /** @type {import("node:fs").Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) findNamed(full, name, out);
    else if (entry.name === name) out.push(full);
  }
  return out;
}

/** @param {string} path */
function fileSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/**
 * @param {string} fromDir
 * @param {string} url
 * @returns {string | null}
 */
function resolveJs(fromDir, url) {
  const rel = url.split("?")[0]?.replace(/^\//, "") ?? "";
  if (!rel.endsWith(".js")) return null;
  const candidates = [join(fromDir, rel), join(dirname(fromDir), rel)];
  return candidates.find((path) => existsSync(path)) ?? null;
}

/** Scripts and modulepreloads referenced by a built HTML document. */
/** @param {string} htmlPath */
export function bytesFromHtml(htmlPath) {
  const html = readFileSync(htmlPath, "utf8");
  const base = dirname(htmlPath);
  const seen = new Set();
  let total = 0;
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+\.js)"/g)) {
    const abs = resolveJs(base, match[1] ?? "");
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    total += fileSize(abs);
  }
  return total;
}

/**
 * @param {Record<string, ManifestEntry>} manifest
 * @param {string} id
 * @param {string} dir
 * @param {Set<string>} seen
 */
function graphBytes(manifest, id, dir, seen) {
  if (seen.has(id)) return 0;
  seen.add(id);
  const meta = manifest[id];
  if (!meta || typeof meta !== "object") return 0;
  let total = 0;
  if (typeof meta.file === "string") {
    const abs = resolveJs(dir, meta.file);
    if (abs) total += fileSize(abs);
  }
  const imports = Array.isArray(meta.imports) ? meta.imports : [];
  for (const dep of imports) total += graphBytes(manifest, dep, dir, seen);
  return total;
}

/** Largest static entry graph in a Vite manifest. Dynamic imports are not first load. */
/** @param {string} manifestPath */
export function bytesFromManifest(manifestPath) {
  /** @type {Record<string, ManifestEntry> | null} */
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return 0;
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return 0;
  const dir = dirname(manifestPath);
  const entries = Object.entries(manifest).filter(([, meta]) => meta?.isEntry && typeof meta.file === "string");
  let max = 0;
  for (const [id] of entries) max = Math.max(max, graphBytes(manifest, id, dir, new Set()));
  return max;
}

/**
 * @param {string} dir
 * @param {string[]} [out]
 * @param {number} [depth]
 * @returns {string[]}
 */
function walkManifests(dir, out = [], depth = 0) {
  // Vercel nests the Start manifest under functions/__server.func/.vercel/output/static/assets.
  if (depth > 8) return out;
  /** @type {import("node:fs").Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "_libs" || entry.name === "_chunks") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkManifests(full, out, depth + 1);
    else if (entry.name.includes("tanstack-start-manifest") && entry.name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

/** @param {string} block @returns {string[]} */
function assetRefs(block) {
  return [...block.matchAll(/"(\/assets\/[^"]+\.js)"/g)].flatMap((match) => (match[1] ? [match[1]] : []));
}

/**
 * @param {string} distDir
 * @param {Iterable<string>} urls
 * @param {Set<string>} [skip]
 */
function bytesOf(distDir, urls, skip = new Set()) {
  let total = 0;
  for (const url of urls) {
    if (skip.has(url)) continue;
    total += fileSize(join(distDir, url.replace(/^\//, "")));
  }
  return total;
}

/** Shell plus the home route. TanStack Start emits no static index.html. */
/** @param {string} distDir */
export function bytesFromStartManifest(distDir) {
  const parent = dirname(distDir);
  const files = [...walkManifests(join(parent, "functions")), ...walkManifests(join(parent, "server")), ...walkManifests(distDir)];
  let best = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rootAt = text.indexOf("__root__:");
    if (rootAt < 0) continue;
    const afterRoot = text.slice(rootAt);
    const nextKey = afterRoot.search(/\n\t"[^"]+":/);
    const rootBlock = nextKey === -1 ? afterRoot : afterRoot.slice(0, nextKey);
    const shell = new Set(assetRefs(rootBlock));
    let total = bytesOf(distDir, shell);
    const homeAt = text.indexOf('\n\t"/":');
    if (homeAt !== -1) {
      const home = text.slice(homeAt);
      const homeEnd = home.slice(1).search(/\n\t"[^"]+":/);
      const homeBlock = homeEnd === -1 ? home : home.slice(0, homeEnd + 1);
      total += bytesOf(distDir, assetRefs(homeBlock), shell);
    }
    best = Math.max(best, total);
  }
  return best;
}

/** @param {string} distDir */
export function firstLoadBytes(distDir) {
  let best = 0;
  for (const html of findNamed(distDir, "index.html")) best = Math.max(best, bytesFromHtml(html));
  if (best > 0) return best;
  for (const manifest of findNamed(distDir, "manifest.json")) best = Math.max(best, bytesFromManifest(manifest));
  if (best > 0) return best;
  return bytesFromStartManifest(distDir);
}

/** True when an unmeasurable first load should fail the build. Opt-in only. */
/** @param {NodeJS.ProcessEnv} [env] */
export function firstLoadStrict(env = process.env) {
  return env.BUDGET_STRICT === "1";
}

/**
 * Messages for a budget run. An unmeasurable first load is a warning unless
 * BUDGET_STRICT=1. The total cap is always enforced. CI does not imply strict.
 * @param {BudgetResult} result
 * @param {NodeJS.ProcessEnv} [env]
 */
export function budgetReport(result, env = process.env) {
  /** @type {Array<[string, string]>} */
  const lines = [];
  let fail = false;
  if (!result.firstLoad) {
    const message = "Could not measure first-load JavaScript (no index.html scripts or Vite manifest entry).";
    if (firstLoadStrict(env)) {
      lines.push(["error", message]);
      fail = true;
    } else {
      lines.push(["warn", `${message} Enforcing the total only.`]);
    }
  } else if (result.firstLoad > result.firstBudget) {
    lines.push(["error", "First-load bundle budget exceeded."]);
    fail = true;
  }
  if (result.total > result.budget) {
    lines.push(["error", "Total bundle budget exceeded."]);
    fail = true;
  }
  return { fail, lines };
}

/** Check the build output against the budget. Call with the client output dir. */
/**
 * @param {string} distDir
 * @param {NodeJS.ProcessEnv} [env]
 */
export function checkBudget(distDir, env = process.env) {
  const total = sumJs(distDir);
  const firstLoad = firstLoadBytes(distDir);
  const result = { total, firstLoad, budget: TOTAL, firstBudget: FIRST_LOAD, ok: true };
  result.ok = !budgetReport(result, env).fail;
  return result;
}

function defaultDist() {
  const candidates = [".output/public", ".vercel/output/static", "frontend/.output/public", "frontend/.vercel/output/static"];
  return candidates.find((dir) => existsSync(dir)) || ".output/public";
}

if (process.argv[1]?.endsWith("bundle-budget.mjs")) {
  const dist = process.argv[2] || defaultDist();
  const result = checkBudget(dist);
  console.log(
    `Bundle total: ${(result.total / 1024).toFixed(0)} KB / ${(result.budget / 1024).toFixed(0)} KB; first load: ${(result.firstLoad / 1024).toFixed(0)} KB / ${(result.firstBudget / 1024).toFixed(0)} KB`,
  );
  const report = budgetReport(result);
  for (const [level, message] of report.lines) {
    if (level === "warn") console.warn(message);
    else console.error(message);
  }
  if (report.fail) process.exit(1);
  console.log("Bundle budget OK");
}
