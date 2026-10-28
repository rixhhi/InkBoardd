import {
  SLIDE_MAX_BYTES,
  ensurePdfPage,
  errStatus,
  fetchAllowlisted,
  isHttpsCdn,
  isSlideUrl,
  rasterContentType,
  rasterKind,
  readCapped,
  withUpstreamSlot,
  withLiveCacheBust,
} from "@inkboard/shared/cdn-proxy";

const SLIDE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://unacademy.com",
  Referer: "https://unacademy.com/",
  Accept: "image/jpeg,image/png,image/webp,image/*,*/*;q=0.8",
};

export async function handleSlide(request: Request): Promise<Response> {
        const reqUrl = new URL(request.url);
        const liveSnap = reqUrl.searchParams.get("live") === "1";
        // searchParams is already decoded — do not decodeURIComponent again.
        const raw = reqUrl.searchParams.get("u") || "";
        let parsed: URL;
        try {
          parsed = new URL(raw);
        } catch {
          return new Response("Invalid slide link", { status: 400 });
        }
        parsed = withLiveCacheBust(ensurePdfPage(parsed), liveSnap);
        if (!isSlideUrl(parsed)) {
          return new Response("Host not allowed", { status: 400 });
        }
        try {
          return await withUpstreamSlot(async () => {
            const res = await fetchAllowlisted(parsed, {
              allowed: isHttpsCdn,
              headers: liveSnap
                ? { ...SLIDE_HEADERS, "Cache-Control": "no-cache", Pragma: "no-cache" }
                : SLIDE_HEADERS,
              signal: AbortSignal.timeout(20_000),
            });
            if (!res.ok) {
              try {
                await res.body?.cancel();
              } catch {
                /* closed */
              }
              return new Response("Slide missing", { status: 404 });
            }
            const hinted = (res.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
            const buf = await readCapped(res, SLIDE_MAX_BYTES);
            const kind = rasterKind(buf, hinted);
            const type = rasterContentType(kind, hinted);
            if (!type) {
              return new Response(kind === "pdf" ? "Not an image" : "Slide missing", {
                status: kind === "pdf" ? 415 : 502,
              });
            }
            return new Response(Buffer.from(buf), {
              headers: {
                "Content-Type": type,
                "Cache-Control": liveSnap ? "no-store" : "public, max-age=86400, immutable",
              },
            });
          });
        } catch (err) {
          const status = errStatus(err, 502);
          const msg = err instanceof Error ? err.message : "Slide missing";
          return new Response(msg, { status });
        }
}
