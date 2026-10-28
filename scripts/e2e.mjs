#!/usr/bin/env node
/**
 * Browser end-to-end check against a running InkBoard (default http://localhost:3000).
 *
 *   E2E_BASE=http://localhost:3000 \
 *   E2E_ADMIN=owner@inkboard.local:pass E2E_MEMBER=riya@inkboard.local:pass \
 *   node scripts/e2e.mjs [--shots dir]
 *
 * E2E_VIEWPORTS=desktop,phone limits the run.
 *
 * Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`,
 * or point PLAYWRIGHT_DIR at a folder that has it installed). Exits 1 on any failure.
 */
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
let passed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    console.log(`  FAIL ${name}`);
  }
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
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

async function noOverflow(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, `${label}: page scrolls sideways by ${over}px`);
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

for (const vp of viewports) {
  console.log(`\n${vp.id} ${vp.width}x${vp.height}`);
  // A fresh browser per viewport keeps memory low on small machines.
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const watch = (page, who) => {
    page.on("pageerror", (e) => pageErrors.push(`${vp.id} ${who}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|status of 40[13]/.test(m.text())) pageErrors.push(`${vp.id} ${who} console: ${m.text().slice(0, 160)}`);
    });
  };

  /* signed out */
  const anonCtx = await browser.newContext({ viewport: vp });
  const anon = await anonCtx.newPage();
  watch(anon, "anon");
  await check("signed-out visitors land on the sign-in page", async () => {
    await open(anon, "/planner/today");
    expect(new URL(anon.url()).pathname === "/login", `ended on ${anon.url()}`);
    await shot(anon, `${vp.id}-login`);
  });
  await anonCtx.close();

  /* admin */
  const adminCtx = await browser.newContext({ viewport: vp });
  const admin = await adminCtx.newPage();
  watch(admin, "admin");
  await check("admin signs in and lands on the dashboard", async () => {
    await signIn(admin, adminEmail, adminPw);
    expect(new URL(admin.url()).pathname === "/admin", `ended on ${admin.url()}`);
  });
  const tabs = ["overview", "members", "groups", "sharing", "activity", "audit", "settings", "admins"];
  for (const tab of tabs) {
    await check(`admin tab: ${tab}`, async () => {
      await open(admin, `/admin?tab=${tab}`);
      const selected = await admin.getByRole("tab", { selected: true }).first().textContent();
      expect(selected, "no selected tab");
      await noOverflow(admin, tab);
      await shot(admin, `${vp.id}-admin-${tab}`);
    });
  }
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
  for (const path of ["/settings", "/planner/today", "/planner/new", "/planner/settings", "/library", "/browse"]) {
    await check(`page renders: ${path}`, async () => {
      await open(admin, path);
      await noOverflow(admin, path);
      await shot(admin, `${vp.id}-page${path.replaceAll("/", "-")}`);
    });
  }
  await adminCtx.close();

  /* member */
  const memberCtx = await browser.newContext({ viewport: vp });
  const member = await memberCtx.newPage();
  watch(member, "member");
  await check("member signs in to their dashboard", async () => {
    await signIn(member, memberEmail, memberPw);
    expect(new URL(member.url()).pathname === "/", `ended on ${member.url()}`);
    await noOverflow(member, "member home");
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
  await check("member planner renders", async () => {
    await open(member, "/planner/today");
    await noOverflow(member, "member planner");
    await shot(member, `${vp.id}-member-planner`);
  });
  await memberCtx.close();
  await browser.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  - ${f}`);
if (pageErrors.length) {
  console.log(`\nPage errors (${pageErrors.length}):`);
  for (const e of [...new Set(pageErrors)].slice(0, 30)) console.log(`  - ${e}`);
}
process.exit(failures.length || pageErrors.length ? 1 : 0);
