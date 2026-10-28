import {
  SLIDE_MAX_BYTES,
  errStatus,
  fetchAllowlisted,
  isHttpsCdn,
  isSlideUrl,
  rasterContentType,
  rasterKind,
  readCapped,
  withUpstreamSlot,
} from "@inkboard/shared/cdn-proxy";
import { FIRST_SLIDE_URL, firstSlideBody, firstSlideReady, isFirstSlideHost, parseFirstSlideBody, type FirstSlideMeta } from "@inkboard/shared/live-dcn";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://unacademy.com",
  Referer: "https://unacademy.com/",
};

function metaFromQuery(request: Request): { uid: string; meta: FirstSlideMeta } | null {
  const q = new URL(request.url).searchParams;
  const uid = q.get("uid") || "";
  if (!/^[A-Za-z0-9]{4,16}$/.test(uid)) return null;
  const className = (q.get("name") || "").trim().slice(0, 160);
  if (!className) return null;
  return {
    uid,
    meta: {
      className,
      courseName: (q.get("course") || className).trim().slice(0, 160),
      educatorName: (q.get("educator") || "").trim().slice(0, 80),
      rank: (q.get("rank") || "1").trim().slice(0, 8),
      special: q.get("special") === "1",
      theme: q.get("theme") === "DARK_THEME" ? "DARK_THEME" : "LIGHT_THEME",
    },
  };
}

export async function handleLiveSlide(request: Request): Promise<Response> {
        const parsedReq = metaFromQuery(request);
        if (!parsedReq) {
          return new Response("Invalid class", { status: 400 });
        }
        const body = firstSlideBody(parsedReq.meta);
        if (!firstSlideReady(body)) {
          return new Response("Board missing", { status: 404 });
        }
        try {
          return await withUpstreamSlot(async () => {
            const lookup = await fetchAllowlisted(FIRST_SLIDE_URL, {
              method: "POST",
              allowed: isFirstSlideHost,
              headers: { ...HEADERS, "Content-Type": "application/json", Accept: "text/plain, application/json, */*" },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(8_000),
            });
            if (!lookup.ok) {
              try {
                await lookup.body?.cancel();
              } catch {
                /* closed */
              }
              return new Response("Board missing", { status: 404 });
            }
            const raw = await lookup.text();
            const abs = parseFirstSlideBody(raw);
            if (!abs) return new Response("Board missing", { status: 404 });
            let parsed: URL;
            try {
              parsed = new URL(abs);
            } catch {
              return new Response("Board missing", { status: 404 });
            }
            if (!isSlideUrl(parsed)) return new Response("Host not allowed", { status: 400 });
            const res = await fetchAllowlisted(parsed, {
              allowed: isHttpsCdn,
              headers: { ...HEADERS, Accept: "image/jpeg,image/png,image/webp,image/*,*/*;q=0.8" },
              signal: AbortSignal.timeout(12_000),
            });
            if (!res.ok) {
              try {
                await res.body?.cancel();
              } catch {
                /* closed */
              }
              return new Response("Board missing", { status: 404 });
            }
            const hinted = (res.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
            const buf = await readCapped(res, SLIDE_MAX_BYTES);
            const kind = rasterKind(buf, hinted);
            const type = rasterContentType(kind, hinted);
            if (!type) return new Response("Board missing", { status: 502 });
            return new Response(Buffer.from(buf), {
              headers: {
                "Content-Type": type,
                "Cache-Control": "no-store",
              },
            });
          });
        } catch (err) {
          const status = errStatus(err, 502);
          const msg = err instanceof Error ? err.message : "Board missing";
          return new Response(msg, { status });
        }
}
