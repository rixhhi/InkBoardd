import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as PE } from "react";
import { LazyWhiteboard } from "@/components/whiteboard-lazy";
import { SlideStrip } from "@/components/slide-strip";
import { isBoardClass, slideAt, type Timeline } from "@inkboard/shared/dcn";
import { offlineHotkey } from "@inkboard/shared/bundle/offline-keys";
import {
  assignMediaTime,
  boxStyle,
  bufferedPct,
  clampSeek,
  cycleSpeed,
  formatSpeed,
  formatTime,
  jumpSlideTime,
  layoutSlate,
  mediaDuration,
  playGlyph,
  seekBarIntent,
  seekBarLayers,
  showSeekSpinner,
  stepSpeed,
  timeFromClientX,
  keepPlayingAfterSeek,
  type Box,
} from "@/components/player-controls";
import { readPos, writePos } from "../library/db.ts";
import { SeekHover } from "@/components/seek-hover";
import { NotesReader } from "@/components/notes-reader";
import { skipSilenceTo, type SilenceRange } from "@/lib/study";
import { lockPitch } from "@/components/player/engine";
import { COPY } from "@inkboard/shared/copy";
import type { SpriteSheet } from "@/lib/sprite-sheet";

/** Saved position, but a lecture that was watched to the end restarts from 0. */
function resumeAt(timeline: Timeline) {
  const saved = readPos(timeline.id);
  const total = timeline.durationMs / 1000;
  return total > 0 && saved >= total - 5 ? 0 : saved;
}

export function OfflinePlayer({
  timeline,
  title,
  onClose,
  onNext,
  onPrev,
  hasNext = false,
  hasPrev = false,
  autoPlayNext = true,
  onAutoPlayNextChange,
  sprites,
  audioUrl = "",
  notesUrl = "",
  silence = [],
}: {
  timeline: Timeline;
  title: string;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  autoPlayNext?: boolean;
  onAutoPlayNextChange?: (v: boolean) => void;
  sprites?: SpriteSheet | null;
  audioUrl?: string;
  notesUrl?: string;
  silence?: SilenceRange[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(() => resumeAt(timeline));
  const [duration, setDuration] = useState(timeline.durationMs / 1000);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [camOff, setCamOff] = useState(false);
  const [stripOn, setStripOn] = useState(true);
  const [fs, setFs] = useState(false);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [err, setErr] = useState("");
  const [listen, setListen] = useState(false);
  const [silenceOn, setSilenceOn] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [box, setBox] = useState<Box>({ x: 24, y: 24, w: 120, h: 120 });
  const [board, setBoard] = useState<Box | null>(null);
  const dragRef = useRef<{ px: number; py: number; bx: number; by: number; moved: boolean } | null>(null);
  const wantPlay = useRef(false);

  const isBoard = isBoardClass(timeline);
  const slide = slideAt(timeline, time * 1000);
  const cap = mediaDuration(duration, timeline.durationMs / 1000);
  const layers = seekBarLayers({ played: time, hover: hoverT, duration: cap, dragging: scrubbing });
  const bufPct = bufferedPct(videoRef.current?.buffered ?? null, cap);
  const glyph = playGlyph(playing, false);
  const showBuffer = showSeekSpinner({ ready: true, buffering, playing, previewing: hoverT != null && !scrubbing });

  const place = useCallback(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;
    const width = stageEl.clientWidth;
    const height = stageEl.clientHeight;
    if (width < 80 || height < 80) return;
    const laid = layoutSlate(
      { width, height },
      { camOff, pocket: width < 640, pip: true, filmOn: stripOn && isBoard },
    );
    setBox(laid.lantern);
    setBoard(laid.board);
  }, [camOff, stripOn, isBoard]);

  useEffect(() => {
    place();
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(place);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [place]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    lockPitch(v, speed);
    v.volume = volume;
    v.muted = muted;
  }, [speed, volume, muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const start = resumeAt(timeline);
    if (start > 1) assignMediaTime(v, start);
    const onVis = () => {
      if (document.visibilityState === "visible") setTime(v.currentTime || 0);
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => writePos(timeline.id, v.currentTime || 0), 4000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
      writePos(timeline.id, v.currentTime || 0);
    };
  }, [timeline.id]);

  function sync(v: HTMLVideoElement) {
    let t = v.currentTime || 0;
    if (silenceOn && silence.length && !v.paused && !v.seeking) {
      const jump = skipSilenceTo(t, silence);
      if (jump != null && jump - t > 0.2) {
        assignMediaTime(v, jump);
        t = jump;
      }
    }
    setTime(t);
    setPlaying(!v.paused);
    const d = mediaDuration(v.duration, timeline.durationMs / 1000);
    if (d > 0) setDuration(d);
  }

  const seekTo = useCallback(
    (next: number) => {
      const v = videoRef.current;
      if (!v) return;
      const t = clampSeek(next, cap);
      const was = !v.paused;
      assignMediaTime(v, t);
      setTime(t);
      void keepPlayingAfterSeek(v, was);
    },
    [cap],
  );

  function onBar(phase: "move" | "down" | "up" | "leave", e: PE<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = timeFromClientX(e.clientX, rect, cap);
    const intent = seekBarIntent(phase, scrubbing, e.buttons);
    if (intent === "hover") setHoverT(t);
    if (intent === "scrub") {
      setScrubbing(true);
      setHoverT(t);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (intent === "commit") {
      setScrubbing(false);
      setHoverT(null);
      seekTo(t);
    }
    if (intent === "clear") {
      setScrubbing(false);
      setHoverT(null);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      const action = offlineHotkey(e, e.target as HTMLElement | null, { hasNext, hasPrev });
      if (!action) return;
      if (action.type === "togglePlay") {
        e.preventDefault();
        if (v.paused) {
          wantPlay.current = true;
          void v.play();
        } else {
          wantPlay.current = false;
          v.pause();
        }
      } else if (action.type === "seekBy") seekTo(v.currentTime + action.seconds);
      else if (action.type === "toggleCam") setCamOff((c) => !c);
      else if (action.type === "toggleMute") {
        v.muted = !v.muted;
        setMuted(v.muted);
      } else if (action.type === "speed") setSpeed((s) => stepSpeed(s, action.dir));
      else if (action.type === "next") onNext?.();
      else if (action.type === "prev") onPrev?.();
      else if (action.type === "fullscreen") {
        const el = wrapRef.current;
        if (!el) return;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void el.requestFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cap, seekTo, hasNext, hasPrev, onNext, onPrev]);

  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function onPointerDown(e: PE<HTMLElement>) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, bx: box.x, by: box.y, moved: false };
  }
  function onPointerMove(e: PE<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.px;
    const dy = e.clientY - drag.py;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    setBox((b) => ({ ...b, x: drag.bx + dx, y: drag.by + dy }));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  const clock = hoverT != null ? hoverT : time;
  const hasFilm = isBoard && stripOn && timeline.slides.some((s) => s.url);

  return (
    <div ref={wrapRef} className="slate">
      <div className="slate-inscribe" style={{ minHeight: "2.25rem", paddingBlock: "0.25rem" }}>
        <button type="button" className="rail-btn" onClick={onClose} aria-label="Back to saved classes">
          ←
        </button>
        <p className="slate-title truncate">{title}</p>
        {hasPrev ? (
          <button type="button" className="rail-btn" onClick={onPrev} aria-label="Previous lecture">
            Previous
          </button>
        ) : null}
        {hasNext ? (
          <button type="button" className="rail-btn" onClick={onNext} aria-label="Next lecture">
            Next
          </button>
        ) : null}
        {onNext ? (
          <button
            type="button"
            className="rail-btn"
            aria-pressed={autoPlayNext}
            onClick={() => onAutoPlayNextChange?.(!autoPlayNext)}
          >
            {autoPlayNext ? "Auto-play on" : "Auto-play off"}
          </button>
        ) : null}
        {isBoard ? (
          <>
            <button
              type="button"
              className="rail-btn"
              aria-pressed={stripOn}
              aria-label={stripOn ? "Hide slides" : "Show slides"}
              onClick={() => setStripOn((s) => !s)}
            >
              {stripOn ? "Hide slides" : "Show slides"}
            </button>
            <button
              type="button"
              className="rail-btn"
              aria-pressed={!camOff}
              aria-label={camOff ? "Show camera" : "Hide camera"}
              onClick={() => setCamOff((c) => !c)}
            >
              {camOff ? "Show camera" : "Hide camera"}
            </button>
          </>
        ) : null}
      </div>

      <div ref={stageRef} className={`slate-stage${hasFilm ? " has-film" : ""}`}>
        {isBoard ? (
          <section className="slate-field is-board" style={board ? boxStyle(board) : undefined}>
            <LazyWhiteboard timeline={timeline} videoRef={videoRef} clockMs={time * 1000} />
          </section>
        ) : null}

        <div
          className={
            !isBoard
              ? "slate-field overflow-hidden"
              : camOff || listen
                ? "pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
                : "lantern"
          }
          style={!isBoard || camOff || listen ? (!isBoard ? { inset: 8 } : undefined) : boxStyle(box)}
          onPointerMove={isBoard && !camOff ? onPointerMove : undefined}
          onPointerUp={isBoard && !camOff ? onPointerUp : undefined}
          onPointerCancel={isBoard && !camOff ? onPointerUp : undefined}
        >
          <div
            className={isBoard && !camOff ? "lantern-face overflow-hidden rounded-full" : "h-full w-full"}
            style={isBoard && !camOff ? { clipPath: "circle(50% at 50% 50%)" } : undefined}
          >
            <video
              ref={videoRef}
              src={(listen && audioUrl) || timeline.videoUrl || undefined}
              className={
                `${
                  isBoard && !camOff && !listen
                    ? "pointer-events-none absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-[42%] object-cover"
                    : "block h-full w-full object-contain bg-board"
                }${listen ? " is-listen" : ""}`
              }
              style={isBoard && !camOff ? { width: "170%", height: "170%" } : undefined}
              playsInline
              controls={false}
              onTimeUpdate={(e) => sync(e.currentTarget)}
              onPlay={(e) => sync(e.currentTarget)}
              onPause={(e) => sync(e.currentTarget)}
              onSeeked={(e) => sync(e.currentTarget)}
              onRateChange={(e) => setSpeed(e.currentTarget.playbackRate || 1)}
              onWaiting={() => setBuffering(true)}
              onPlaying={() => setBuffering(false)}
              onCanPlay={() => setBuffering(false)}
              onError={() => setErr("This recording could not be played.")}
              onEnded={() => {
                if (autoPlayNext && hasNext && onNext) onNext();
              }}
            >
              <track kind="captions" srcLang="en" label="Captions" />
            </video>
          </div>
          {isBoard && !camOff ? (
            <div
              className="absolute inset-0 z-10 cursor-grab touch-none"
              onPointerDown={onPointerDown}
              aria-label="Drag teacher camera"
            />
          ) : null}
        </div>

        {showBuffer ? <span className="slate-buffer" aria-hidden="true" /> : null}
        {err ? <p className="slate-err">{err}</p> : null}

        {hasFilm ? (
          <div className="slate-film is-side">
            <SlideStrip
              vertical
              slides={timeline.slides}
              currentUid={slide.uid}
              onJump={(uid) => {
                const t = jumpSlideTime(timeline, uid);
                if (t != null) seekTo(t);
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="chalk-rail-wrap">
        <div
          className={`rail-seek-hit${hoverT != null || scrubbing ? " is-hot" : ""}`}
          onPointerDown={(e) => onBar("down", e)}
          onPointerMove={(e) => onBar("move", e)}
          onPointerUp={(e) => onBar("up", e)}
          onPointerLeave={(e) => onBar("leave", e)}
        >
          {layers.hoverPct != null && hoverT != null ? (
            <SeekHover
              pct={layers.hoverPct}
              label={formatTime(hoverT)}
              time={hoverT}
              sheet={sprites}
              slideUrl={sprites ? null : slideAt(timeline, hoverT * 1000).url}
            />
          ) : null}
          <input
            type="range"
            min={0}
            max={cap || 1}
            step={0.1}
            value={Math.min(clock, cap || 1)}
            aria-label="Seek"
            aria-valuetext={formatTime(clock)}
            tabIndex={-1}
            onChange={() => {}}
            className="rail-seek"
            style={{ ["--seek"]: `${layers.fillPct}%`, ["--buf"]: `${Math.max(bufPct, layers.fillPct)}%` } as CSSProperties}
          />
        </div>
        <div className="chalk-rail">
          <button
            type="button"
            className="rail-btn is-play"
            aria-label={glyph === "pause" ? "Pause" : "Play"}
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) {
                wantPlay.current = true;
                void v.play();
              } else {
                wantPlay.current = false;
                v.pause();
              }
            }}
          >
            {glyph === "pause" ? "Pause" : "Play"}
          </button>
          <button type="button" className="rail-btn" aria-label="Back 10 seconds" onClick={() => seekTo(time - 10)}>
            −10
          </button>
          <button type="button" className="rail-btn" aria-label="Forward 10 seconds" onClick={() => seekTo(time + 10)}>
            +10
          </button>
          <span className={`rail-time tabular${hoverT != null ? " is-preview" : ""}`}>
            {formatTime(clock)} / {formatTime(cap)}
          </span>
          <button
            type="button"
            className="rail-btn"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.muted = !v.muted;
              setMuted(v.muted);
            }}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="Volume"
            className="hidden h-1.5 w-20 sm:block"
            onChange={(e) => {
              const n = Number(e.target.value);
              setVolume(n);
              setMuted(n === 0);
            }}
          />
          <button type="button" className="rail-btn" aria-label={`Playback speed ${speed}x`} onClick={() => setSpeed((s) => cycleSpeed(s))}>
            {formatSpeed(speed)}×
          </button>
          <button
            type="button"
            className={`rail-btn${listen ? " is-on" : ""}`}
            aria-label={listen ? COPY.showVideo : COPY.listen}
            onClick={() => setListen((on) => !on)}
          >
            {listen ? COPY.showVideo : COPY.listen}
          </button>
          {silence.length ? (
            <button
              type="button"
              className={`rail-btn${silenceOn ? " is-on" : ""}`}
              aria-label={silenceOn ? COPY.keepSilence : COPY.skipSilence}
              aria-pressed={silenceOn}
              onClick={() => setSilenceOn((on) => !on)}
            >
              {silenceOn ? COPY.keepSilence : COPY.skipSilence}
            </button>
          ) : null}
          {notesUrl ? (
            <button type="button" className="rail-btn" aria-label={COPY.readNotes} onClick={() => setNotesOpen(true)}>
              {COPY.notes}
            </button>
          ) : null}
          <button
            type="button"
            className="rail-btn ml-auto"
            aria-label={fs ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => {
              const el = wrapRef.current;
              if (!el) return;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void el.requestFullscreen();
            }}
          >
            {fs ? "Exit" : "Full"}
          </button>
        </div>
      </div>
      {notesOpen && notesUrl ? <NotesReader url={notesUrl} title={title} onClose={() => setNotesOpen(false)} /> : null}
    </div>
  );
}
