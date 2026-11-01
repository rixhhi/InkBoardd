import { rangeReply } from "./offline-range.js";

/**
 * Two jobs:
 *   1. /offline-media/*  — range-served blobs saved by the offline library (below).
 *   2. App shell         — so the planner opens on a train. Built assets
 *      (/assets/*, hashed, immutable) are cache-first; navigations are
 *      network-first with the last good copy of that page as the fallback,
 *      and the home page as the fallback for a page never visited. API calls
 *      are never cached: planner data lives in localStorage and syncs when
 *      the browser is back online (account-sync.ts listens for `online`).
 */
const SHELL = "inkboard-shell-v1";
const SHELL_PATHS = ["/", "/planner/today", "/planner", "/planner/ink", "/library", "/manifest.webmanifest", "/favicon.svg"];

// Bump when the caching strategy changes; a new build does not need a bump
// because hashed assets are keyed by URL.

/**
 * No skipWaiting() here: a new worker that takes over mid-session can serve a
 * page whose hashed chunks belong to the previous build. The page shows an
 * "Inkboard updated — Reload" toast and tells the waiting worker to activate
 * only when the person agrees (see OfflineWorker in routes/__root.tsx).
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.allSettled(SHELL_PATHS.map((p) => c.add(new Request(p, { credentials: "same-origin" })))))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("inkboard-shell-") && k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/offline-media/")) {
    event.respondWith(serve(req));
    return;
  }
  if (req.method !== "GET") return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/healthz" || url.pathname === "/readyz") return;
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(assetFirst(req));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(pageFirst(req));
  }
});

async function assetFirst(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function pageFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    // Only remember real pages, not redirects to /login or error pages.
    if (res.ok && res.type === "basic" && !res.redirected) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    const url = new URL(req.url);
    return (
      (await cache.match(req, { ignoreSearch: true })) ||
      (await cache.match(url.pathname.startsWith("/planner") ? "/planner/today" : "/")) ||
      new Response("<!doctype html><meta charset=utf-8><title>Offline</title><p style=\"font:16px system-ui;padding:2rem\">You are offline and this page has not been opened before. Open the planner once while online and it will work here.</p>", {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
}

async function serve(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (!hit) return fetch(request);
  const blob = await hit.blob();
  const total = blob.size;
  const type = hit.headers.get("content-type") || blob.type || "application/octet-stream";
  const reply = rangeReply(total, request.headers.get("range"), type);
  if (!reply) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${total}`,
        "Accept-Ranges": "bytes",
      },
    });
  }
  const headers = {
    "Content-Type": reply.contentType,
    "Accept-Ranges": "bytes",
  };
  if (reply.status === 416) {
    if (reply.contentRange) headers["Content-Range"] = reply.contentRange;
    return new Response(null, { status: 416, headers });
  }
  const part = blob.slice(reply.start, reply.end + 1);
  headers["Content-Length"] = String(part.size);
  if (reply.status === 206 && reply.contentRange) headers["Content-Range"] = reply.contentRange;
  return new Response(part, { status: reply.status, headers });
}
