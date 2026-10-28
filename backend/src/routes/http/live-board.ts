import { fetchAllowlisted, isUnacademyHost, readCapped } from "@inkboard/shared/cdn-proxy";
import { allowRate } from "../../middlewares/rate-limit.ts";
import {
  encodeLiveSse,
  isHandoutsHost,
  jwtFields,
  liveProxyHistoryUrl,
  parseHandoutSlides,
  pullProxyHistoryPages,
  seedHandoutEvents,
  watchLiveSocketLoop,
  HANDOUTS_LIST_URL,
  liveHistoryDoneSse,
  type LiveRawEvent,
} from "@inkboard/shared/live-dcn";
import { parseLiveSession } from "@inkboard/shared/live-session";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://unacademy.com",
  Referer: "https://unacademy.com/",
};

const HISTORY_MAX = 8 * 1024 * 1024;

async function getProxyJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetchAllowlisted(url, {
    allowed: isUnacademyHost,
    headers: HEADERS,
    signal,
  });
  if (!res.ok) throw new Error(String(res.status));
  const buf = await readCapped(res, HISTORY_MAX);
  return JSON.parse(new TextDecoder().decode(buf)) as unknown;
}

async function seedHandouts(token: string, signal: AbortSignal): Promise<LiveRawEvent[]> {
  if (!token) return [];
  try {
    const res = await fetchAllowlisted(HANDOUTS_LIST_URL, {
      allowed: isHandoutsHost,
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {
        /* closed */
      }
      return [];
    }
    const buf = await readCapped(res, 2 * 1024 * 1024);
    const urls = parseHandoutSlides(JSON.parse(new TextDecoder().decode(buf)) as unknown);
    return seedHandoutEvents(urls);
  } catch {
    return [];
  }
}

export async function handleLiveBoard(request: Request, ip = "local"): Promise<Response> {
        if (!(await allowRate(`${ip}:live-board`, 8, 60_000))) {
          return new Response("Too many requests", { status: 429, headers: { "Retry-After": "30" } });
        }
        const uid = new URL(request.url).searchParams.get("uid") || "";
        if (!/^[A-Za-z0-9]{4,16}$/.test(uid)) {
          return new Response("Invalid class", { status: 400 });
        }
        let session: ReturnType<typeof parseLiveSession>;
        try {
          const res = await fetchAllowlisted(`https://unacademy.com/api/v1/uplus/classes/${uid}/token/`, {
            allowed: isUnacademyHost,
            headers: HEADERS,
            signal: AbortSignal.timeout(12_000),
          });
          const body = await res.json().catch(() => ({}));
          session = parseLiveSession(uid, body, res.status);
        } catch {
          return new Response("Couldn’t open this class", { status: 502 });
        }
        if (!session.jwt && !session.proxyToken && !session.className) {
          return new Response(session.message || "No live board", { status: session.gated ? 403 : 404 });
        }
        const fields = jwtFields(session.jwt);
        const ac = new AbortController();
        request.signal.addEventListener("abort", () => ac.abort());

        const stream = new ReadableStream({
          start(controller) {
            const send = (chunk: string) => {
              try {
                controller.enqueue(new TextEncoder().encode(chunk));
              } catch {
                ac.abort();
              }
            };
            send("retry: 2500\n\n");
            const ping = setInterval(() => send(": ping\n\n"), 15_000);
            ac.signal.addEventListener("abort", () => clearInterval(ping));

            const run = async () => {
              const liveP = session.jwt
                ? watchLiveSocketLoop({
                    jwt: session.jwt,
                    classId: uid,
                    goalUid: fields.goalUid,
                    uid: fields.uid,
                    wsDomain: session.wsDomain,
                    signal: ac.signal,
                    onEvents: (events: LiveRawEvent[]) => send(encodeLiveSse(events)),
                    onReady: () => send(": ready\n\n"),
                  })
                : new Promise<void>(() => {
                    /* hang until abort */
                  });
              const seedP = (async () => {
                const hands = await seedHandouts(session.handoutToken, ac.signal);
                if (hands.length) send(encodeLiveSse(hands));
                if (session.proxyToken && liveProxyHistoryUrl(session.proxyToken)) {
                  try {
                    const hist = await pullProxyHistoryPages(session.proxyToken, (url) => getProxyJson(url, ac.signal));
                    const chunk = 250;
                    for (let i = 0; i < hist.length; i += chunk) {
                      if (ac.signal.aborted) return;
                      const part = encodeLiveSse(hist.slice(i, i + chunk));
                      if (part) send(part);
                    }
                  } catch {
                    /* WS history still runs */
                  }
                }
                send(liveHistoryDoneSse());
              })();
              await Promise.all([seedP, liveP]);
            };

            void run().catch((err) => {
              console.warn("[live-board] stream failed", err instanceof Error ? err.message : err);
            });
            ac.signal.addEventListener("abort", () => {
              clearInterval(ping);
              try {
                controller.close();
              } catch {
                /* closed */
              }
            });
          },
          cancel() {
            ac.abort();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
}
