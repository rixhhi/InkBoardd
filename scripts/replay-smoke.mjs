#!/usr/bin/env node
/**
 * Browser replay check: plays a synthetic board lesson in the real player and reads the ink
 * canvas pixels at chosen moments. Covers what unit tests cannot: that the engine's output is
 * actually painted (strokes, undo, erase-all + undo, a filled shape, a new blank page).
 *
 *   node --experimental-strip-types scripts/replay-fixture.ts /tmp/fixture.json
 *   ffmpeg -f lavfi -i color=c=black:s=320x180:r=10 -t 12 -c:v libvpx -b:v 50k -an /tmp/replay.webm
 *   REPLAY_FIXTURE=/tmp/fixture.json REPLAY_VIDEO=/tmp/replay.webm \
 *   E2E_BASE=http://localhost:3000 E2E_MEMBER=member@ci.local:ci-member-pass-1 \
 *   PLAYWRIGHT_DIR=/tmp/pw node scripts/replay-smoke.mjs [--shots dir]
 *
 * The lesson timeline and video are served by request interception, so no Unacademy access is needed.
 */
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_DIR ? join(resolve(process.env.PLAYWRIGHT_DIR), "package.json") : import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const [email, pw] = (process.env.E2E_MEMBER || "").split(/:(.*)/s);
const FIXTURE = process.env.REPLAY_FIXTURE;
const VIDEO = process.env.REPLAY_VIDEO;
const shotsAt = process.argv.indexOf("--shots");
const SHOTS = shotsAt > 0 ? resolve(process.argv[shotsAt + 1] || "replay-shots") : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
if (!email || !FIXTURE || !VIDEO) {
  console.error("Set E2E_MEMBER, REPLAY_FIXTURE and REPLAY_VIDEO.");
  process.exit(2);
}

const timeline = JSON.parse(readFileSync(FIXTURE, "utf8"));
const video = readFileSync(VIDEO);
// 1x1 white PNG for the slide backdrops.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");

let failed = 0;
let passed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

/** Ink pixels (alpha > 40) inside a normalised box of the ink canvas. */
const INK = `(box) => {
  const c = document.querySelectorAll("canvas")[1];
  if (!c) return -1;
  const x0 = Math.floor(box[0] * c.width), y0 = Math.floor(box[1] * c.height);
  const w = Math.max(1, Math.floor((box[2] - box[0]) * c.width)), h = Math.max(1, Math.floor((box[3] - box[1]) * c.height));
  const d = c.getContext("2d").getImageData(x0, y0, w, h).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n += 1;
  return n;
}`;

const REGION = {
  a: [0.05, 0.12, 0.45, 0.38], // stroke "a"
  b: [0.05, 0.52, 0.45, 0.78], // stroke "b"
  hex: [0.5, 0.1, 0.95, 0.65], // hexagon shape
  all: [0, 0, 1, 1],
};

async function seek(page, sec) {
  await page.evaluate(
    (t) =>
      new Promise((res) => {
        const v = document.querySelector("video");
        v.pause();
        const done = () => res(null);
        v.addEventListener("seeked", done, { once: true });
        v.currentTime = t;
        setTimeout(done, 2500);
      }),
    sec,
  );
  // Let the paint loop run a few frames after the seek.
  await page.waitForTimeout(450);
}

const ink = (page, box) => page.evaluate(`(${INK})(${JSON.stringify(box)})`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource|net::ERR|404|403/.test(m.text())) errors.push(m.text());
});

try {
  // Sign in.
  await page.goto(`${BASE}/login`);
  // Wait for hydration, or React clears what we type (same wait as scripts/e2e.mjs).
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.getByLabel("Email").fill(email, { timeout: 15_000 });
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });

  // Serve the synthetic lesson.
  await page.route(`**/api/lessons/${timeline.id}/timeline`, (r) => r.fulfill({ json: timeline }));
  // Chromium only seeks in a webm when the server answers Range requests with 206, so honour them.
  await page.route("**/uamedia.uacdn.net/**", (r) => {
    const m = /bytes=(\d*)-(\d*)/.exec(r.request().headers().range || "");
    if (!m) return r.fulfill({ status: 200, body: video, headers: { "content-type": "video/webm", "accept-ranges": "bytes", "content-length": String(video.length) } });
    const start = m[1] ? Number(m[1]) : 0;
    const end = Math.min(m[2] ? Number(m[2]) : video.length - 1, video.length - 1);
    return r.fulfill({
      status: 206,
      body: video.subarray(start, end + 1),
      headers: { "content-type": "video/webm", "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${video.length}`, "content-length": String(end - start + 1) },
    });
  });
  await page.route("**/static.uacdn.net/replay-smoke/**", (r) => r.fulfill({ body: PNG, contentType: "image/png" }));
  await page.route(/\/api\/(lessons\/[^/]+\/notes|lessons\/probe|media|cdn)/, (r) => r.fulfill({ json: null }));

  await page.goto(`${BASE}/play/${timeline.id}?title=Replay%20smoke`);
  await page.waitForSelector("canvas", { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 1, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);

  check("player mounts the board canvases", (await page.locator("canvas").count()) >= 2);
  check("a video element is present", (await page.locator("video").count()) >= 1);

  await seek(page, 0.5);
  check("before any ink the board is empty", (await ink(page, REGION.all)) === 0, `ink=${await ink(page, REGION.all)}`);

  await seek(page, 1.6);
  const a1 = await ink(page, REGION.a);
  check("t=1.6 stroke a is drawn", a1 > 30, `a=${a1}`);
  check("t=1.6 stroke b is not there yet", (await ink(page, REGION.b)) === 0);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "t1.6-stroke-a.png") });

  await seek(page, 2.6);
  check("t=2.6 both strokes are drawn", (await ink(page, REGION.a)) > 30 && (await ink(page, REGION.b)) > 30);

  await seek(page, 3.6);
  check("t=3.6 undo removed stroke b", (await ink(page, REGION.b)) === 0, `b=${await ink(page, REGION.b)}`);
  check("t=3.6 undo kept stroke a", (await ink(page, REGION.a)) > 30);

  await seek(page, 5.6);
  check("t=5.6 erase-all cleared the page", (await ink(page, REGION.all)) === 0, `ink=${await ink(page, REGION.all)}`);

  await seek(page, 6.6);
  check("t=6.6 undo after erase-all brought stroke a back", (await ink(page, REGION.a)) > 30, `a=${await ink(page, REGION.a)}`);
  check("t=6.6 stroke b stays gone (it was undone earlier)", (await ink(page, REGION.b)) === 0);

  await seek(page, 8.2);
  const hex = await ink(page, REGION.hex);
  check("t=8.2 the hexagon shape is drawn in its box", hex > 150, `hex=${hex}`);
  // A box fallback would be a plain rectangle: the real hexagon leaves the corners of its box empty.
  const corner = await ink(page, [0.55, 0.15, 0.6, 0.2]);
  check("t=8.2 it is a hexagon outline, not a rectangle (box corner is empty)", corner < 12, `corner=${corner}`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "t8.2-hexagon.png") });

  await seek(page, 10.2);
  check("t=10.2 the new blank page shows no ink from page one", (await ink(page, REGION.all)) === 0, `ink=${await ink(page, REGION.all)}`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "t10.2-blank-page.png") });

  await seek(page, 1.6);
  check("seeking back to t=1.6 redraws stroke a exactly as before", Math.abs((await ink(page, REGION.a)) - a1) <= 2, `a=${await ink(page, REGION.a)} vs ${a1}`);

  await page.setViewportSize({ width: 820, height: 600 });
  await page.waitForTimeout(600);
  check("after a resize the ink is repainted, not cleared", (await ink(page, REGION.a)) > 20, `a=${await ink(page, REGION.a)}`);

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (err) {
  failed += 1;
  console.log(`FAIL  replay run crashed -- ${err instanceof Error ? err.message.split("\n")[0] : err}`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "crash.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
