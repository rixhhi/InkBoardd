import { useEffect, useState } from "react";
import { compactEvents, pendingTimeline, type Timeline } from "./dcn.ts";
import { bumpLiveOrigin, decodeLivePayload, extractLiveBundle, hasLiveSlideNav, isPdfNotes, lastBoardMs, liveBoardStreamUrl, liveClockMs, liveCompactDelay, liveHeartbeat, liveHistoryBody, livePaintClock, LIVE_INK_LEAD_MS, LIVE_WS_HISTORY_PAGES, liveSubscribeBody, liveWsUrl, mergeLiveEvents, overlayLiveSnapshot, pinLiveNow, pinLiveRaster, pinLiveSlide, refreshLiveSlides, remapLiveInk, shouldPackHistoryDone, shouldPackLiveBurst, socketInfoKind, jwtFields, type LiveRawEvent } from "./live-dcn.ts";
import type { LiveSession } from "./live-session.ts";

function packBoard(
  id: string,
  title: string,
  events: LiveRawEvent[],
  seedUrl = "",
  uadoc = false,
): Timeline {
  const rows = overlayLiveSnapshot(events, seedUrl, uadoc);
  if (!rows.length) {
    const blank = pendingTimeline(id, title);
    return { ...blank, kind: "board", videoUrl: "" };
  }
  const tl = pinLiveSlide(compactEvents(id, [rows], { liveBoard: true }));
  const hasPdf = tl.slides.some((s) => isPdfNotes(s.url || ""));
  const pinned = pinLiveNow(remapLiveInk(uadoc && !hasPdf ? pinLiveRaster(tl) : tl));
  return refreshLiveSlides({ ...pinned, kind: "board", videoUrl: "", title: title || pinned.title }, Date.now());
}

export function useLiveBoard(session: LiveSession | undefined, ingestRef?: { current: ((raw: unknown) => void) | null }) {
  const id = session?.classId ?? "";
  const title = session?.display || session?.className || "Live";
  const [timeline, setTimeline] = useState<Timeline>(() => packBoard(id || "live", title, []));
  const [clockMs, setClockMs] = useState(0);
  const [connected, setConnected] = useState(false);
  const snapshotSrc = "";

  useEffect(() => {
    if (!session?.classId) return;
    const live = session;
    const uadoc = live.useUadoc && !live.useCanvas;
    const events: LiveRawEvent[] = [];
    const keys = new Set<string>();
    let origin = { p: 0, wall: Date.now() };
    let packedMs = 0;
    let compactTimer = 0;
    let packedOnce = false;
    let catchingUp = true;
    let historyPages = 0;
    let subCount = 0;
    let closed = false;
    let ws: WebSocket | null = null;
    let es: EventSource | null = null;

    const compact = () => {
      if (closed) return;
      compactTimer = 0;
      catchingUp = false;
      const tl = packBoard(live.classId, live.display || live.className || "Live", events, "", uadoc);
      packedMs = lastBoardMs(tl);
      packedOnce = true;
      setTimeline(tl);
      setClockMs(livePaintClock(tl, origin, Date.now()));
    };

    const scheduleCompact = (ms: number) => {
      if (closed) return;
      window.clearTimeout(compactTimer);
      compactTimer = window.setTimeout(compact, ms);
    };

    const tickClock = () => {
      setClockMs(Math.max(liveClockMs(origin.p, origin.wall, Date.now()), packedMs + LIVE_INK_LEAD_MS));
    };

    const ingest = (raw: unknown) => {
      if (closed) return;
      const { events: extra, snapshots } = extractLiveBundle(raw, origin.p * 1000);
      const { added, maxUs } = mergeLiveEvents(events, extra, keys);
      if (maxUs) origin = bumpLiveOrigin(origin, maxUs, Date.now());
      if (added) {
        tickClock();
        const nav = hasLiveSlideNav(extra);
        if (shouldPackLiveBurst({ packedOnce, catchingUp, added })) {
          scheduleCompact(liveCompactDelay({ packedOnce, added, nav, catchingUp }));
        }
      }
      if (snapshots && packedOnce) {
        tickClock();
        setTimeline((tl) => refreshLiveSlides(tl, Date.now()));
      }
      return added;
    };
    if (ingestRef) ingestRef.current = ingest;

    const stream = liveBoardStreamUrl(live.classId);
    if (stream && typeof EventSource !== "undefined") {
      es = new EventSource(stream);
      es.onmessage = (msg) => {
        if (closed || !msg.data) return;
        try {
          ingest(JSON.parse(msg.data));
          setConnected(true);
        } catch {
          /* ignore keepalives */
        }
      };
      es.addEventListener("history-done", () => {
        if (closed) return;
        if (!shouldPackHistoryDone(catchingUp, packedOnce)) return;
        catchingUp = false;
        compact();
      });
      es.onerror = () => {
        /* browser WS + Janus datachannel still run */
      };
    }

    const fields = jwtFields(live.jwt);
    const askHistory = (at = Date.now()) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (historyPages >= LIVE_WS_HISTORY_PAGES) return;
      historyPages += 1;
      ws.send(JSON.stringify(liveHistoryBody(live.classId, fields.goalUid, at)));
    };

    if (live.jwt) {
      try {
        ws = new WebSocket(liveWsUrl(live.wsDomain));
      } catch {
        ws = null;
      }
      if (ws) {
        ws.onopen = () => {
          ws?.send(JSON.stringify(liveSubscribeBody(live.jwt, live.classId, fields.uid || "AN_INK")));
        };
        ws.onmessage = (msg) => {
          void decodeLivePayload(msg.data).then((parsed) => {
            if (closed || parsed == null) return;
            const kind = socketInfoKind(parsed);
            if (kind === "subscribed") {
              subCount += 1;
              if (subCount >= 1) {
                setConnected(true);
                askHistory();
              }
              return;
            }
            if (kind === "pong") return;
            ingest(parsed);
          });
        };
      }
    }

    const ping = window.setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(liveHeartbeat()));
    }, 20_000);
    const clock = window.setInterval(() => {
      tickClock();
    }, 80);

    return () => {
      closed = true;
      if (ingestRef) ingestRef.current = null;
      window.clearTimeout(compactTimer);
      window.clearInterval(ping);
      window.clearInterval(clock);
      try {
        es?.close();
      } catch {
        /* ignore */
      }
      try {
        ws?.close(4001, "done");
      } catch {
        /* ignore */
      }
    };
  }, [session?.classId]);

  return { timeline, clockMs, connected, snapshotSrc };
}