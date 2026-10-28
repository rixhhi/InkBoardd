import { rangeReply } from "./offline-range.js";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/offline-media/")) return;
  event.respondWith(serve(event.request));
});

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
