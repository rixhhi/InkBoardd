import { DeskSkip } from "@/components/folio/skip-link";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, CameraOff, Maximize, Volume2, VolumeX } from "lucide-react";
import { Badge, Button, IconButton } from "@/components/ui";
import { LiveVideo } from "@/components/live-video";
import { useJanusCam } from "@/components/janus-cam";
import { LazyWhiteboard } from "@/components/whiteboard-lazy";
import { boxStyle, clampBox, layoutSlate, type Box } from "@/components/player-controls";
import { COPY } from "@inkboard/shared/copy";
import { canJoinLive, type LiveSession } from "@inkboard/shared/live-session";
import { liveFillCamera, timelineHasBoard } from "@inkboard/shared/live-dcn";
import { useLiveBoard } from "@inkboard/shared/use-live-board";

export function LiveStage({
  session,
  title,
  educator,
  backTo,
}: {
  session: LiveSession;
  title: string;
  educator?: string;
  backTo: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const ingestRef = useRef<((raw: unknown) => void) | null>(null);
  const [camOff, setCamOff] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [err, setErr] = useState("");
  const [up, setUp] = useState(false);
  const [join, setJoin] = useState(0);
  const [box, setBox] = useState<Box>({ x: 24, y: 24, w: 128, h: 128 });
  const [board, setBoard] = useState<Box>({ x: 8, y: 8, w: 0, h: 0 });
  const userBox = useRef(false);
  const drag = useRef<{ px: number; py: number; bx: number; by: number; bw: number; mode: "move" | "resize"; moved: boolean } | null>(
    null,
  );

  const hls = session.hlsUrl;
  const janus = canJoinLive(session) && !hls;
  const { timeline, clockMs, snapshotSrc } = useLiveBoard(janus ? session : undefined, ingestRef);
  const boardful = timelineHasBoard(timeline);
  const fillCam = janus && liveFillCamera({ streamCanvas: session.streamCanvas, boardful });
  const asLantern = janus && !fillCam;

  useJanusCam(
    janus ? session : undefined,
    videoRef,
    (s) => {
      if (s.error) setErr(s.error);
      if (s.up) {
        setUp(true);
        setErr("");
      }
    },
    (raw) => ingestRef.current?.(raw),
    join,
  );

  const place = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const laid = layoutSlate(
      { width: el.clientWidth, height: el.clientHeight },
      { camOff, pocket: el.clientWidth < 640, pip: true },
    );
    setBoard(laid.board);
    if (!userBox.current) {
      const s = el.clientWidth < 640 ? 120 : 196;
      setBox(clampBox({ ...laid.lantern, w: s, h: s }, el.getBoundingClientRect(), true));
    }
  }, [camOff]);

  useEffect(() => {
    userBox.current = false;
    place();
  }, [place]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!userBox.current) place();
      else setBox((b) => clampBox(b, el.getBoundingClientRect(), true));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [place]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.volume = volume;
  }, [muted, volume]);

  function toggleFs() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }

  const videoEl = (
    <video
      ref={videoRef}
      className={
        asLantern && !camOff
          ? "pointer-events-none absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-[42%] object-cover"
          : "block h-full w-full bg-bg object-contain"
      }
      style={asLantern && !camOff ? { width: "170%", height: "170%" } : undefined}
      playsInline
      autoPlay
      muted={muted}
    >
      <track kind="captions" srcLang="en" label="Captions" />
    </video>
  );

  return (
    <>
    <DeskSkip />
    <main id="main" ref={wrapRef} className="slate">
      <header className="slate-inscribe flex h-12 items-center gap-2 bg-bg/85 px-2 backdrop-blur-sm sm:px-3">
        <Button variant="ghost" size="sm" icon={ArrowLeft} asChild className="size-10 p-0">
          <Link to={backTo} aria-label={COPY.backToTheWall} />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-base leading-tight text-fg sm:text-lg">{title}</h1>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
            <Badge tone="live">{COPY.live}</Badge>
            {educator ? <span className="truncate">{educator}</span> : null}
          </p>
        </div>
        {asLantern ? (
          <IconButton
            label={camOff ? COPY.showCamera : COPY.hideCamera}
            icon={camOff ? Camera : CameraOff}
            pressed={!camOff}
            onClick={() => setCamOff((on) => !on)}
          />
        ) : null}
      </header>

      <div ref={stageRef} className="slate-stage">
        {hls ? (
          <section className="slate-field" style={{ inset: 8 }}>
            <LiveVideo src={hls} />
          </section>
        ) : janus ? (
          <>
            {asLantern ? (
              <section className="slate-field" style={board.w ? boxStyle(board) : { inset: 8 }}>
                <LazyWhiteboard timeline={timeline} videoRef={videoRef} clockMs={clockMs} preferClock liveBackdrop={snapshotSrc} />
              </section>
            ) : null}
            <section
              className={asLantern ? `lantern${camOff ? " is-off" : ""}` : "slate-field"}
              style={
                asLantern
                  ? camOff || box.w <= 1
                    ? { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }
                    : boxStyle(box)
                  : board.w
                    ? boxStyle(board)
                    : { inset: 8 }
              }
            >
              <div className={asLantern && !camOff ? "lantern-face" : "h-full w-full"}>{videoEl}</div>
              {asLantern && !camOff ? (
                <>
                  {/* Pointer-only drag surface over the camera; double-click re-docks it. The lantern menu offers the same moves to keyboard users. */}
                  <div
                    className="absolute inset-0 z-10 cursor-grab touch-none"
                    aria-hidden="true"
                    onDoubleClick={() => {
                      userBox.current = false;
                      place();
                    }}
                    onPointerDown={(e) => {
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      userBox.current = true;
                      drag.current = { px: e.clientX, py: e.clientY, bx: box.x, by: box.y, bw: box.w, mode: "move", moved: false };
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current;
                      const stage = stageRef.current?.getBoundingClientRect();
                      if (!d || !stage) return;
                      const dx = e.clientX - d.px;
                      const dy = e.clientY - d.py;
                      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
                      if (d.mode === "move") setBox((b) => clampBox({ ...b, x: d.bx + dx, y: d.by + dy }, stage, true));
                      else {
                        const s = d.bw + dx;
                        setBox((b) => clampBox({ ...b, w: s, h: s }, stage, true));
                      }
                    }}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                  />
                  <button
                    type="button"
                    className="seal-notch absolute z-20"
                    style={{ right: "16%", bottom: "16%" }}
                    aria-label="Resize teacher"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      userBox.current = true;
                      drag.current = { px: e.clientX, py: e.clientY, bx: box.x, by: box.y, bw: box.w, mode: "resize", moved: false };
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current;
                      const stage = stageRef.current?.getBoundingClientRect();
                      if (!d || !stage || d.mode !== "resize") return;
                      const s = d.bw + (e.clientX - d.px);
                      setBox((b) => clampBox({ ...b, w: s, h: s }, stage, true));
                    }}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                  />
                </>
              ) : null}
            </section>
          </>
        ) : null}

        {!up && janus && !err ? <span className="slate-buffer" aria-hidden="true" /> : null}
        {err ? (
          <div role="alert" className="absolute inset-x-3 bottom-20 z-30 mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 rounded-md bg-danger-subtle px-3 py-2 text-sm text-fg shadow-2">
            <p className="m-0 min-w-0 flex-1">{err}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setErr("");
                setUp(false);
                setJoin((n) => n + 1);
              }}
            >
              {COPY.tryAgain}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="chalk-rail-wrap flex h-14 items-center gap-1 bg-bg/90 px-2 backdrop-blur-sm sm:px-3">
        <IconButton label={muted ? COPY.soundOn : COPY.mute} icon={muted ? VolumeX : Volume2} onClick={() => setMuted((on) => !on)} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          aria-label={COPY.volume}
          className="volume-track w-24"
          onChange={(e) => {
            const next = Number(e.target.value);
            setVolume(next);
            setMuted(next === 0);
          }}
        />
        <span className="flex-1" />
        <IconButton label={COPY.fullscreen} icon={Maximize} onClick={toggleFs} />
      </div>
    </main>
    </>
  );
}
