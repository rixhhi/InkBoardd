import { useEffect, useRef, type RefObject } from "react";
import {
  janusAttach,
  janusCreate,
  janusDestroy,
  janusJoin,
  janusKeepalive,
  janusPoll,
  janusPost,
  janusStart,
  janusTrickle,
  parseJanusEvent,
} from "@inkboard/shared/janus-listen";
import { decodeLivePayload } from "@inkboard/shared/live-dcn";
import { canJoinLive, janusBases, liveJoinKey, type LiveSession } from "@inkboard/shared/live-session";
import { COPY } from "@inkboard/shared/copy";

export function useJanusCam(
  session: LiveSession | undefined,
  video: RefObject<HTMLVideoElement | null>,
  onStatus: (s: { error?: string; up?: boolean }) => void,
  onData?: (raw: unknown) => void,
  retry = 0,
) {
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const dataRef = useRef(onData);
  dataRef.current = onData;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const joinKey = session && canJoinLive(session) ? liveJoinKey(session) : "";

  useEffect(() => {
    const live = sessionRef.current;
    if (!live || !joinKey || !canJoinLive(live)) return;
    const joined = live;
    const el = video.current;
    if (!el) return;
    const ac = new AbortController();
    let pc: RTCPeerConnection | null = null;
    let sessionUrl = "";
    let handleUrl = "";
    let keepId = 0;
    let pollGen = 0;
    let tries = 0;
    let pendingOld: { pc: RTCPeerConnection; session: string } | null = null;
    const bound = new WeakSet<RTCDataChannel>();
    const joinToken = joined.janusToken;
    const token = () => joinToken;

    const bindData = (ch: RTCDataChannel) => {
      if (bound.has(ch)) return;
      bound.add(ch);
      ch.binaryType = "arraybuffer";
      ch.onmessage = (m) => {
        void decodeLivePayload(m.data).then((raw) => {
          if (raw != null) dataRef.current?.(raw);
        });
      };
    };

    const post = (url: string, body: unknown) => janusPost(url, body, ac.signal);

    const tearPc = (dropFrame: boolean) => {
      window.clearInterval(keepId);
      keepId = 0;
      pollGen += 1;
      const old = sessionUrl;
      handleUrl = "";
      sessionUrl = "";
      pc?.close();
      pc = null;
      if (dropFrame) {
        const node = video.current || el;
        if (node) node.srcObject = null;
      }
      if (old) {
        void janusPost(old, janusDestroy(token())).catch(() => {
          /* ignore */
        });
      }
    };

    async function reconnect() {
      if (ac.signal.aborted) return;
      if (tries >= 3) {
        statusRef.current({ error: "The live picture dropped" });
        return;
      }
      tries += 1;
      window.clearInterval(keepId);
      keepId = 0;
      pollGen += 1;
      if (pc && sessionUrl) pendingOld = { pc, session: sessionUrl };
      handleUrl = "";
      sessionUrl = "";
      pc = null;
      await new Promise((r) => setTimeout(r, 400 * tries));
      if (ac.signal.aborted) return;
      await start();
      if (!pc && pendingOld) {
        pc = pendingOld.pc;
        sessionUrl = pendingOld.session;
        pendingOld = null;
        void pollLoop();
      }
    }

    async function pollLoop() {
      const gen = ++pollGen;
      while (!ac.signal.aborted && gen === pollGen && sessionUrl) {
        try {
          const raw = await janusPoll(sessionUrl, ac.signal);
          const events = parseJanusEvent(raw);
          for (const ev of events) {
            if (ev.error) statusRef.current({ error: ev.error });
            if (ev.hangup) {
              void reconnect();
              return;
            }
            if (ev.webrtcup) statusRef.current({ up: true });
            if (ev.jsep?.type === "offer" && ev.jsep.sdp && pc && handleUrl) {
              await pc.setRemoteDescription({ type: "offer", sdp: ev.jsep.sdp });
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              if (answer.sdp) {
                await post(handleUrl, janusStart({ room: joined.room, token: token(), sdp: answer.sdp }));
              }
            }
          }
        } catch (err) {
          if (ac.signal.aborted) return;
          if (err instanceof Error && err.name === "AbortError") return;
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }

    async function start() {
      const bases = janusBases(joined);
      let lastErr: unknown;
      for (const base of bases) {
        try {
          const created = await post(base, janusCreate(token()));
          const sid = created?.data?.id;
          if (!sid) throw new Error("No Janus session");
          sessionUrl = `${base}/${sid}`;
          const attached = await post(sessionUrl, janusAttach(token()));
          const hid = attached?.data?.id;
          if (!hid) throw new Error("No Janus handle");
          handleUrl = `${sessionUrl}/${hid}`;

          pc = new RTCPeerConnection({ iceServers: joined.iceServers });
          const dc = pc.createDataChannel("JanusDataChannel");
          bindData(dc);
          pc.ondatachannel = (e) => bindData(e.channel);
          pc.ontrack = (e) => {
            const node = video.current || el;
            if (!node) return;
            const stream = e.streams[0] || new MediaStream(e.track ? [e.track] : []);
            if (node.srcObject !== stream) node.srcObject = stream;
            if (pendingOld) {
              pendingOld.pc.close();
              const stale = pendingOld.session;
              pendingOld = null;
              if (stale) {
                void janusPost(stale, janusDestroy(token())).catch(() => {
                  /* ignore */
                });
              }
            }
            void node.play().catch(() => {
              /* autoplay may need mute */
            });
            statusRef.current({ up: true });
          };
          pc.onicecandidate = (e) => {
            if (!handleUrl || ac.signal.aborted) return;
            void post(handleUrl, janusTrickle({ token: token(), candidate: e.candidate })).catch(() => {
              /* trickle best-effort */
            });
          };

          try {
            await post(
              handleUrl,
              janusJoin({ room: joined.room, feed: joined.feed, token: token(), ptype: "listener" }),
            );
          } catch {
            await post(
              handleUrl,
              janusJoin({ room: joined.room, feed: joined.feed, token: token(), ptype: "subscriber" }),
            );
          }
          keepId = window.setInterval(() => {
            if (!sessionUrl || ac.signal.aborted) return;
            void post(sessionUrl, janusKeepalive(token())).catch(() => {
              /* ignore */
            });
          }, 25_000);
          void pollLoop();
          return;
        } catch (err) {
          lastErr = err;
          sessionUrl = "";
          handleUrl = "";
          pc?.close();
          pc = null;
        }
      }
      const msg = lastErr instanceof Error ? lastErr.message : COPY.classDidNotOpen;
      if (ac.signal.aborted || /aborted/i.test(msg)) return;
      statusRef.current({ error: msg });
    }

    void start();

    return () => {
      ac.abort();
      if (pendingOld) {
        pendingOld.pc.close();
        const stale = pendingOld.session;
        pendingOld = null;
        if (stale) {
          void janusPost(stale, janusDestroy(token())).catch(() => {
            /* ignore */
          });
        }
      }
      tearPc(true);
    };
  }, [joinKey, video, retry]);
}
