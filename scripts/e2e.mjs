#!/usr/bin/env node
/**
 * Browser end-to-end check against a running InkBoard (default http://localhost:3000).
 *
 *   E2E_BASE=http://localhost:3000 \
 *   E2E_ADMIN=owner@inkboard.local:pass E2E_MEMBER=riya@inkboard.local:pass \
 *   node scripts/e2e.mjs [--shots dir]
 *
 * E2E_VIEWPORTS=desktop,phone limits the run. E2E_SCHEME=dark runs it in dark mode.
 * Every page check also asserts no sideways scroll and axe-core 0 serious/critical
 * (E2E_AXE=0 to skip; axe is read from frontend/node_modules).
 *
 * Flake control: a failing check is retried once (E2E_RETRIES, default 1) before it
 * counts. CI sets E2E_RETRIES=0 on purpose: a flake there fails the job so it gets fixed.
 * counts. On the final failure a full-page screenshot and the page's console log are
 * written to --shots as <check>-FAILED.png / .log, and a Playwright trace (.zip, open
 * with `npx playwright show-trace`) when E2E_TRACE=1. A JUnit report goes to
 * E2E_JUNIT (default <shots>/junit.xml) so CI can render it.
 *
 * Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`,
 * or point PLAYWRIGHT_DIR at a folder that has it installed). Exits 1 on any failure.
 */
import { shotName } from "./lib/shot-name.mjs";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_DIR ? join(resolve(process.env.PLAYWRIGHT_DIR), "package.json") : import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const [adminEmail, adminPw] = (process.env.E2E_ADMIN || "").split(/:(.*)/s);
const [memberEmail, memberPw] = (process.env.E2E_MEMBER || "").split(/:(.*)/s);
const shotsAt = process.argv.indexOf("--shots");
const SHOTS = shotsAt > 0 ? resolve(process.argv[shotsAt + 1] || "e2e-shots") : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
if (!adminEmail || !memberEmail) {
  console.error("Set E2E_ADMIN and E2E_MEMBER as email:password.");
  process.exit(2);
}

const failures = [];
const pageErrors = [];
/** @type {{ name: string, ms: number, ok: boolean, message?: string, retried: boolean }[]} */
const results = [];
let passed = 0;
const RETRIES = Math.max(0, Number(process.env.E2E_RETRIES ?? 1) || 0);
const TRACE = process.env.E2E_TRACE === "1";

/** Page the current check is driving, so a failure can screenshot it. Set by the loops below. */
let currentPage = null;
let currentCtx = null;
let currentVp = "";
const consoleLines = new WeakMap();

function safeName(name) {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function onFinalFailure(name, err) {
  const page = currentPage;
  if (!page || !SHOTS) return;
  const base = join(SHOTS, `${currentVp}-${safeName(name)}-FAILED`);
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  const lines = consoleLines.get(page) ?? [];
  const { writeFileSync } = require("node:fs");
  try {
    writeFileSync(`${base}.log`, [`url: ${page.url()}`, `error: ${err instanceof Error ? err.stack || err.message : String(err)}`, "", "console:", ...lines.slice(-80)].join("\n"));
  } catch {
    /* read-only shots dir */
  }
  if (TRACE && currentCtx) await currentCtx.tracing.stop({ path: `${base}.trace.zip` }).catch(() => {});
}

async function check(name, fn) {
  const started = Date.now();
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      if (TRACE && currentCtx && attempt === 0) await currentCtx.tracing.start({ screenshots: true, snapshots: true }).catch(() => {});
      await fn();
      if (TRACE && currentCtx) await currentCtx.tracing.stop().catch(() => {});
      passed++;
      results.push({ name: `${currentVp} ${name}`, ms: Date.now() - started, ok: true, retried: attempt > 0 });
      console.log(`  ok  ${name}${attempt ? ` (after ${attempt} retry)` : ""}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) {
        console.log(`  retry ${name}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  const message = lastErr instanceof Error ? lastErr.message.split("\n")[0] : String(lastErr);
  failures.push(`${name}: ${message}`);
  results.push({ name: `${currentVp} ${name}`, ms: Date.now() - started, ok: false, message, retried: RETRIES > 0 });
  console.log(`  FAIL ${name}`);
  await onFinalFailure(name, lastErr);
}

function junit() {
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const cases = results
    .map((r) => `    <testcase classname="inkboard.e2e" name="${esc(r.name)}" time="${(r.ms / 1000).toFixed(3)}">${r.ok ? "" : `<failure message="${esc(r.message ?? "")}"/>`}</testcase>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="inkboard e2e" tests="${results.length}" failures="${failures.length}" time="${(results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(3)}">\n${cases}\n</testsuite>\n`;
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.screenshot({ path: join(SHOTS, `${shotName(name)}.png`), fullPage: true });
}

async function noOverflow(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, `${label}: page scrolls sideways by ${over}px`);
}

/**
 * axe-core, serious + critical only, same bar as the review passes. Loaded from
 * the frontend's devDependency so CI needs nothing extra; skipped (with a note)
 * if it cannot be found. Set E2E_AXE=0 to turn off.
 */
let axeSource = null;
function loadAxe() {
  if (axeSource !== null || process.env.E2E_AXE === "0") return axeSource;
  try {
    const { readFileSync } = require("node:fs");
    const candidates = [
      process.env.AXE_PATH,
      join(process.cwd(), "frontend/node_modules/axe-core/axe.min.js"),
      join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    ].filter(Boolean);
    for (const c of candidates) {
      try {
        axeSource = readFileSync(c, "utf8");
        return axeSource;
      } catch {
        /* next */
      }
    }
  } catch {
    /* fall through */
  }
  axeSource = false;
  console.log("  note: axe-core not found; accessibility checks skipped (npm i -D axe-core in frontend/)");
  return axeSource;
}

async function noAxeSerious(page, label) {
  const src = loadAxe();
  if (!src) return;
  await page.addScriptTag({ content: src });
  const bad = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ["violations"] });
    return r.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} x${v.nodes.length} (${v.nodes[0]?.target?.[0] ?? "?"})`);
  });
  expect(!bad.length, `${label}: axe ${bad.join("; ")}`);
}

/** Page is laid out, has no sideways scroll, and passes axe serious/critical. */
async function pageIsSound(page, label) {
  await noOverflow(page, label);
  await noAxeSerious(page, label);
}

async function signIn(page, email, password) {
  const seen = [];
  const log = (r) => {
    if (r.url().includes("/api/")) seen.push(`${r.status()} ${r.url().replace(BASE, "")}`);
  };
  page.on("response", log);
  try {
    await page.goto(`${BASE}/login`);
    await settle(page);
    await page.getByLabel("Email").fill(email, { timeout: 15_000 });
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click({ timeout: 15_000 });
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
    await settle(page);
  } catch (err) {
    const where = join(SHOTS ?? process.cwd(), `signin-failed-${email.split("@")[0]}.png`);
    await page.screenshot({ path: where, fullPage: true }).catch(() => {});
    throw new Error(`${err instanceof Error ? err.message.split("\n")[0] : err} | url=${page.url()} | api: ${seen.slice(-6).join(", ")} | shot ${where}`);
  } finally {
    page.off("response", log);
  }
}

async function open(page, path) {
  await page.goto(BASE + path);
  await settle(page);
}

const ALL_VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "phone", width: 390, height: 844 },
];
const only = (process.env.E2E_VIEWPORTS || "").split(",").filter(Boolean);
const viewports = only.length ? ALL_VIEWPORTS.filter((v) => only.includes(v.id)) : ALL_VIEWPORTS;
/** E2E_SCHEME=dark runs the whole matrix in dark mode (contrast rules differ per palette). */
const colorScheme = process.env.E2E_SCHEME === "dark" ? "dark" : "light";

for (const vp of viewports) {
  console.log(`\n${vp.id} ${vp.width}x${vp.height} ${colorScheme}`);
  // A fresh browser per viewport keeps memory low on small machines.
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  currentVp = vp.id;
  const watch = (page, who, ctx) => {
    currentPage = page;
    currentCtx = ctx;
    const lines = [];
    consoleLines.set(page, lines);
    page.on("pageerror", (e) => {
      lines.push(`[pageerror] ${e.message}`);
      pageErrors.push(`${vp.id} ${who}: ${e.message}`);
    });
    page.on("console", (m) => {
      lines.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
      if (m.type() === "error" && !/Failed to load resource|status of 40[13]/.test(m.text())) pageErrors.push(`${vp.id} ${who} console: ${m.text().slice(0, 160)}`);
    });
  };

  /* signed out */
  const anonCtx = await browser.newContext({ viewport: vp, colorScheme });
  const anon = await anonCtx.newPage();
  watch(anon, "anon", anonCtx);
  await check("signed-out visitors land on the sign-in page", async () => {
    await open(anon, "/planner/today");
    expect(new URL(anon.url()).pathname === "/login", `ended on ${anon.url()}`);
    await shot(anon, `${vp.id}-login`);
  });
  await anonCtx.close();

  /* admin */
  const adminCtx = await browser.newContext({ viewport: vp, colorScheme });
  const admin = await adminCtx.newPage();
  watch(admin, "admin", adminCtx);
  await check("admin signs in and lands on Home (the admin banner links to the dashboard)", async () => {
    await signIn(admin, adminEmail, adminPw);
    expect(new URL(admin.url()).pathname === "/", `ended on ${admin.url()}`);
    expect(await admin.getByRole("link", { name: /admin dashboard/i }).count() > 0, "Home shows the admin banner");
  });
  const tabs = ["overview", "members", "groups", "sharing", "activity", "audit", "settings", "admins"];
  for (const tab of tabs) {
    await check(`admin tab: ${tab}`, async () => {
      await open(admin, `/admin?tab=${tab}`);
      const selected = await admin.getByRole("tab", { selected: true }).first().textContent();
      expect(selected, "no selected tab");
      await pageIsSound(admin, `admin ${tab}`);
      await shot(admin, `${vp.id}-admin-${tab}`);
    });
  }
  await check("overview shows the weekly digest", async () => {
    await open(admin, "/admin?tab=overview");
    expect(await admin.getByRole("heading", { name: "This week" }).count(), "no digest heading");
  });
  await check("activity tab says it keeps one hour", async () => {
    await open(admin, "/admin?tab=activity");
    expect(await admin.getByText(/last 60 minutes/i).count(), "no 1-hour note");
  });
  await check("share dialog offers groups, dates and pinning", async () => {
    await open(admin, "/admin?tab=sharing");
    await admin.getByRole("button", { name: "Share something" }).first().click();
    await admin.getByText("Visible from").waitFor({ timeout: 5000 });
    expect(await admin.getByRole("radio", { name: "Groups" }).count(), "no Groups audience");
    expect(await admin.getByText("Pin to the top").count(), "no pin switch");
    await shot(admin, `${vp.id}-share-dialog`);
    await admin.keyboard.press("Escape");
  });
  for (const path of ["/", "/settings", "/planner/today", "/planner", "/planner/ink", "/planner/analytics", "/planner/guide", "/planner/new", "/planner/settings", "/library", "/live", "/browse", "/search?q=physics"]) {
    await check(`page renders: ${path}`, async () => {
      await open(admin, path);
      await pageIsSound(admin, path);
      await shot(admin, `${vp.id}-page${path.replaceAll("/", "-")}`);
    });
  }
  await adminCtx.close();

  /* member */
  const memberCtx = await browser.newContext({ viewport: vp, colorScheme });
  const member = await memberCtx.newPage();
  watch(member, "member", memberCtx);
  await check("member signs in to their dashboard", async () => {
    await signIn(member, memberEmail, memberPw);
    expect(new URL(member.url()).pathname === "/", `ended on ${member.url()}`);
    await pageIsSound(member, "member home");
    await shot(member, `${vp.id}-member-home`);
  });
  await check("member has no Browse or Admin in the navigation", async () => {
    const nav = member.getByRole("navigation").first();
    expect((await nav.getByRole("link", { name: "Admin" }).count()) === 0, "Admin link visible");
    const perms = await member.evaluate(async () => (await (await fetch("/api/me")).json()).permissions);
    if (!perms.browse) expect((await member.getByRole("link", { name: "Browse", exact: true }).count()) === 0, "Browse link visible");
  });
  await check("member is kept out of admin and browse", async () => {
    await open(member, "/admin");
    expect(await member.getByText("Admins only").count(), "admin page not locked");
    await shot(member, `${vp.id}-member-admin-locked`);
    const perms = await member.evaluate(async () => (await (await fetch("/api/me")).json()).permissions);
    if (!perms.browse) {
      await open(member, "/browse");
      expect(await member.getByText("Browse is off").count(), "browse not locked");
    }
  });
  await check("member API calls to admin routes are refused", async () => {
    const status = await member.evaluate(async () => (await fetch("/api/admin/overview")).status);
    expect(status === 403, `got ${status}`);
  });
  await check("a '?' opens its help sheet with what / how / why, and axe passes with it open", async () => {
    await open(member, "/planner/ink");
    await member.getByRole("button", { name: /^Help: Ink/ }).first().click();
    const sheet = member.getByRole("dialog").first();
    await sheet.getByRole("heading", { name: "What it is" }).waitFor({ timeout: 5000 });
    expect(await sheet.getByRole("heading", { name: "How to use it" }).count(), "no How section");
    expect(await sheet.getByRole("heading", { name: "Why it's here" }).count(), "no Why section");
    await noAxeSerious(member, "help sheet open");
    await shot(member, `${vp.id}-member-help-sheet`);
    await member.keyboard.press("Escape");
  });
  for (const path of ["/planner/today", "/planner", "/planner/ink", "/planner/dashboard", "/planner/analytics", "/planner/guide", "/library", "/settings"]) {
    await check(`member page renders: ${path}`, async () => {
      await open(member, path);
      await pageIsSound(member, `member ${path}`);
      await shot(member, `${vp.id}-member${path.replaceAll("/", "-")}`);
    });
  }
  await check("member sees the weekly digest nowhere, admin sees it on Overview", async () => {
    const status = await member.evaluate(async () => (await fetch("/api/admin/digest")).status);
    expect(status === 403, `member digest -> ${status}`);
  });
  await memberCtx.close();
  await browser.close();
}

console.log(`\n${passed} passed, ${failures.length} failed${results.some((r) => r.ok && r.retried) ? ` (${results.filter((r) => r.ok && r.retried).length} passed on retry)` : ""}`);
for (const f of failures) console.log(`  - ${f}`);
const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5);
console.log("slowest:", slow.map((r) => `${r.name} ${(r.ms / 1000).toFixed(1)}s`).join(" · "));
const junitPath = process.env.E2E_JUNIT || (SHOTS ? join(SHOTS, "junit.xml") : null);
if (junitPath) {
  try {
    require("node:fs").writeFileSync(junitPath, junit());
    console.log(`junit: ${junitPath}`);
  } catch {
    /* fine */
  }
}
if (pageErrors.length) {
  console.log(`\nPage errors (${pageErrors.length}):`);
  for (const e of [...new Set(pageErrors)].slice(0, 30)) console.log(`  - ${e}`);
}
process.exit(failures.length || pageErrors.length ? 1 : 0);
