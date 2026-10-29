import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceName, looksLikeUserAgent, signInLabel } from "./device.ts";

const CHROME_LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1";
const EDGE_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
const FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36";

test("deviceName picks the browser and OS in the right precedence", () => {
  assert.equal(deviceName(CHROME_LINUX).name, "Chrome on Linux");
  assert.equal(deviceName(SAFARI_IPHONE).name, "Safari on iOS");
  assert.equal(deviceName(CHROME_IOS).name, "Chrome on iOS");
  assert.equal(deviceName(EDGE_WIN).name, "Edge on Windows");
  assert.equal(deviceName(FIREFOX_MAC).name, "Firefox on macOS");
  // Android UAs contain "Linux"; Android must win.
  assert.equal(deviceName(SAMSUNG).name, "Samsung Internet on Android");
});

test("deviceName flags phones and tolerates empty input", () => {
  assert.equal(deviceName(SAFARI_IPHONE).phone, true);
  assert.equal(deviceName(SAMSUNG).phone, true);
  assert.equal(deviceName(CHROME_LINUX).phone, false);
  assert.deepEqual(deviceName(""), { name: "Browser", phone: false });
  assert.deepEqual(deviceName(undefined), { name: "Browser", phone: false });
});

test("signInLabel humanises stored raw user-agents but leaves short names alone", () => {
  assert.equal(looksLikeUserAgent(CHROME_LINUX), true);
  assert.equal(looksLikeUserAgent("Chrome on Linux"), false);
  assert.equal(signInLabel(CHROME_LINUX), "Chrome on Linux");
  assert.equal(signInLabel("Chrome on Linux"), "Chrome on Linux");
  assert.equal(signInLabel(""), "");
  assert.equal(signInLabel(null), "");
  // Rows cut at 120 chars by the old code still parse.
  assert.equal(signInLabel(CHROME_LINUX.slice(0, 120)), "Chrome on Linux");
});
