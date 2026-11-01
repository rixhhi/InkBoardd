import { DeskSkip } from "@/components/folio/skip-link";
import { usePlayerModel } from "@/components/player/use-player-model.tsx";
import { useClassCore } from "@/components/player/use-class-core";
import { useCallback, useEffect, useRef, } from "react";
import { Link, } from "@tanstack/react-router";
import { PlayerTransport } from "@/components/player-transport";
export const DOUBLE_TAP_MS = 250;
import { LazyWhiteboard } from "@/components/whiteboard-lazy";
import { MarkDoneButton } from "@/components/mark-done";
import { ArrowLeft, Camera, CameraOff, Captions, Headphones, LogOut, PictureInPicture2, Play, RotateCcw, SkipForward, TriangleAlert } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { SlideStrip } from "@/components/slide-strip";
import { slideAt, type Timeline } from "@inkboard/shared/dcn";
import { completeLessonInPlan } from "@inkboard/shared/planner/storage";
import { COPY } from "@inkboard/shared/copy";
import { writePrepared } from "@/lib/prepared-media";
import { useAccess } from "@/lib/session";
import {
  formatTime,
  layoutSlate,
  repositionLantern,
  boxStyle,
} from "@/components/player-controls";
import { PlannerPlayerChip } from "@/components/planner-chip";
import { shouldNudgeBreak } from "@inkboard/shared/planner/focus";
import { SaveClassDialog } from "@/components/save-chapter";
import { StudyTray } from "@/components/study-tray";
import { NotesReader } from "@/components/notes-reader";
import type { PreparedMedia, SpriteSheet } from "@/lib/sprite-sheet";


export function ClassPlayer({
  timeline,
  title,
  educator,
  teacherSlug,
  courseId,
  courseSlug,
  fromCourse,
  backTo,
  notesUrl,
  startAt,
  focus,
  sprites,
}: {
  timeline: Timeline;
  title: string;
  educator?: string;
  teacherSlug?: string;
  courseId?: string;
  courseSlug?: string;
  fromCourse?: string;
  backTo?: string;
  notesUrl?: string | null;
  startAt?: number;
  focus?: boolean;
  sprites?: SpriteSheet | null;
}) {
  const core = useClassCore({
    timeline, title, educator, teacherSlug, courseId, courseSlug, fromCourse, backTo, notesUrl, startAt, focus, sprites,
  });
  const {
    videoRef, wrapRef, stageRef, userBoxRef, setLayout, camOff, setCamOff, box, setBox, boardBox, setBoardBox,
    setSideStrip, setCanPlay, stripOn, setStripOn, layout, fs, playing, setPlaying, breakNudge, setBreakNudge,
    playedMs, lastTick, setEnded, setErr, tapTimer, resolvedNotes, setKeepOpen,
    seek, toggleFs, jumpSlide, time, duration, listen, audioUrl, hoverT, sheet,
    nav, sleepUntil, setSleepUntil, sleepLeft, help, isBoard, timeMs, ended, canPlay, err,
    wantPlay, round, nextLesson, holdEnd, openLesson, advanceLeft, slide, pins,
    chaptersOpen, chapterQuery, setChapterQuery, setChaptersOpen, summaryBusy, summary, summaryNote,
    keepOpen, setSheet, setAudioUrl, hlsUrl, setHlsUrl, setSilence, setWaveform, setJobId, notesOpen, setNotesOpen,
  } = core;
  void tapTimer;
  const chromeOpenRef = useRef(true);
  const boardRef = useRef(boardBox);
  const boxRef = useRef(box);
  boxRef.current = box;
  const layoutSeen = useRef(layout);

  const placeVideo = useCallback(
    (next: "pip" | "side") => {
      if (!core.isBoard) return;
      const stageEl = stageRef.current;
      if (!stageEl) return;
      const width = stageEl.clientWidth;
      const height = stageEl.clientHeight;
      if (width < 8 || height < 8) return;
      const pocket = width < 640;
      const nextLayout = pocket ? "pip" : next;
      if (pocket && next === "side") setLayout("pip");
      const laid = layoutSlate(
        { width, height },
        { camOff, pocket, pip: nextLayout === "pip", filmOn: stripOn, chrome: chromeOpenRef.current },
      );
      const stage = { width, height };
      const prevBoard = boardRef.current;
      const sameBoard =
        prevBoard.w >= 8 &&
        prevBoard.x === laid.board.x &&
        prevBoard.y === laid.board.y &&
        prevBoard.w === laid.board.w &&
        prevBoard.h === laid.board.h;
      if (sameBoard) return;
      setSideStrip(laid.sideStrip);
      setBoardBox(laid.board);
      const nextBox =
        userBoxRef.current && prevBoard.w >= 8
          ? repositionLantern(prevBoard, boxRef.current, laid.board, stage, round)
          : laid.lantern;
      boxRef.current = nextBox;
      boardRef.current = laid.board;
      setBox(nextBox);
    },
    [core.isBoard, camOff, stripOn, round, setBoardBox, setBox, setLayout, setSideStrip, stageRef, userBoxRef],
  );

  useEffect(() => {
    const probe = document.createElement("video");
    setCanPlay(probe.canPlayType("video/webm") !== "");
  }, [timeline.videoUrl, setCanPlay]);
  // The prepare job needs the Downloads switch for members; admins always may.
  const access = useAccess();
  const canPrepare = access.admin || access.perms.downloads;

  useEffect(() => {
    const el = stageRef.current;
    const onWinResize = () => placeVideo(layout);
    if (!el || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", onWinResize);
      return () => window.removeEventListener("resize", onWinResize);
    }
    const ro = new ResizeObserver(() => {
      placeVideo(layout);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, placeVideo, setBox, stageRef, userBoxRef]);

  useEffect(() => {
    if (!playing) {
      lastTick.current = null;
      return;
    }
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const now = performance.now();
      if (lastTick.current != null) playedMs.current += now - lastTick.current;
      lastTick.current = now;
      if (shouldNudgeBreak(playedMs.current, breakNudge)) setBreakNudge(true);
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing, breakNudge, lastTick, playedMs, setBreakNudge]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnded = () => {
      setEnded(true);
      setPlaying(false);
      completeLessonInPlan(timeline.id, "auto");
    };
    v.addEventListener("ended", onEnded);
    return () => v.removeEventListener("ended", onEnded);
  }, [timeline.id, timeline.videoUrl, setEnded, setPlaying, videoRef]);

  function retryClass() {
    const v = videoRef.current;
    setErr("");
    setEnded(false);
    if (!v) return;
    v.load();
    void v.play().catch(() => setErr(COPY.slateSlipped));
  }

  const playerModel = usePlayerModel({ ...core, placeVideo, ClassPlayer });
  const {
    onPointerDown, onPointerMove, onPointerUp, hideChrome, cycleLanternSize, lastGestureMoved, pip,
    showBuffer, pipW, pipH, focusRun, replayClass, stayOnClass, chapterList, revisionNotes, runSummary,
    directSrc, videoEl, lineUnder,
  } = playerModel;
  chromeOpenRef.current = !hideChrome;
  useEffect(() => {
    if (layoutSeen.current !== layout) {
      layoutSeen.current = layout;
      userBoxRef.current = false;
    }
    placeVideo(layout);
  }, [layout, placeVideo, fs, hideChrome, userBoxRef]);
  const playbackSrc = listen && audioUrl ? audioUrl : directSrc;


  return (
    <>
    <DeskSkip />
    <main id="main" ref={wrapRef} className="slate">
      {/* Top chrome overlays the stage; layoutSlate() reserves room for it while it is open. */}
      <div className="absolute inset-x-0 top-0 z-40 flex flex-col">
      {focus && focusRun ? (
        <div className="player-chrome flex h-9 items-center gap-3 border-b border-line bg-bg/85 px-3 text-xs text-fg-muted backdrop-blur-sm">
          <span className="font-mono tabular-nums">
            {focusRun.index}/{focusRun.total || 1}
          </span>
          <span className="h-px flex-1 bg-line" aria-hidden="true" />
          <IconButton
            label="Back to today’s board"
            icon={LogOut}
            size="sm"
            onClick={() => void nav({ to: "/planner/today", search: { add: undefined } })}
          />
        </div>
      ) : null}

      <header className="player-chrome flex h-12 shrink-0 items-center gap-2 border-b border-line bg-bg/85 px-2 backdrop-blur-sm sm:px-3" data-idle={hideChrome || undefined}>
        <Link
          to={backTo ?? "/"}
          aria-label={COPY.backToTheWall}
          title={COPY.backToTheWall}
          className="grid size-10 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-base leading-tight text-fg sm:text-lg">{title}</h1>
          {lineUnder ? (
            breakNudge ? (
              <button
                type="button"
                className="block truncate text-left text-xs text-warn hover:underline"
                onClick={() => {
                  setBreakNudge(false);
                  playedMs.current = 0;
                }}
              >
                {COPY.fortyStand}
              </button>
            ) : sleepUntil ? (
              <button type="button" className="block font-mono text-xs text-fg-muted tabular-nums hover:underline" onClick={() => setSleepUntil(null)}>
                {formatTime(sleepLeft)}
              </button>
            ) : (
              <p className={`truncate text-xs ${help ? "font-mono text-fg" : "text-fg-faint"}`}>{lineUnder}</p>
            )
          ) : null}
        </div>
        <MarkDoneButton lessonId={timeline.id} title={title} quiet />
        {isBoard && timeline.slides.some((s: { url?: string }) => s.url) ? (
          <IconButton
            label={stripOn ? COPY.hideSlides : COPY.showSlides}
            icon={Captions}
            pressed={stripOn}
            onClick={() => setStripOn((on: boolean) => !on)}
          />
        ) : null}
        {isBoard ? (
          <IconButton
            label={camOff ? COPY.showCamera : COPY.hideCamera}
            icon={camOff ? CameraOff : Camera}
            pressed={!camOff}
            onClick={() => setCamOff((on: boolean) => !on)}
          />
        ) : null}
      </header>
      </div>

      <PlannerPlayerChip lessonId={timeline.id} watchedSec={time} durationSec={duration} focus={focus} />

      <div
        ref={stageRef}
        className="slate-stage"
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest(".lantern")) return;
          toggleFs();
        }}
      >
        {isBoard ? (
          <section
            className="slate-field"
            style={boardBox.w ? boxStyle(boardBox) : { visibility: "hidden" }}
          >
            <LazyWhiteboard timeline={timeline} videoRef={videoRef} clockMs={timeMs} />
          </section>
        ) : (
          <section className="slate-field" style={{ inset: 8 }}>
            {videoEl}
          </section>
        )}

        {showBuffer ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 z-30 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fg/30 border-t-fg [animation:ui-spin_0.8s_linear_infinite]"
            />
            <span className="sr-only" role="status">{COPY.buffering}</span>
          </>
        ) : null}
        {listen && !isBoard ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-fg-muted">
            <span className="flex items-center gap-2">
              <Headphones aria-hidden="true" className="size-5" />
              {COPY.listen}
            </span>
          </p>
        ) : null}

        {!isBoard && !playing && !ended && canPlay && !err ? (
          <button
            type="button"
            aria-label="Play"
            className="absolute top-1/2 left-1/2 z-[25] grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-fg text-bg shadow-3 transition-transform duration-[var(--dur-fast)] hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              wantPlay.current = true;
              void v.play().then(() => setPlaying(true)).catch(() => {
                wantPlay.current = false;
                setPlaying(false);
              });
            }}
          >
            <Play aria-hidden="true" className="ml-1 size-7 fill-current" />
          </button>
        ) : null}

        {isBoard ? (
          <section
            className={`lantern${listen ? "" : camOff ? " is-off" : round ? "" : " is-docked"}`}
            style={
              camOff || listen || box.w <= 1
                ? { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none", left: 0, top: 0 }
                : boxStyle({ x: box.x, y: box.y, w: pipW, h: round ? pipW : pipH })
            }
            onPointerMove={camOff ? undefined : onPointerMove}
            onPointerUp={camOff ? undefined : onPointerUp}
            onPointerCancel={camOff ? undefined : onPointerUp}
          >
            {round && !camOff ? (
              <div
                className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={(e) => onPointerDown(e, "move")}
                aria-hidden="true"
                data-handle="move"
              />
            ) : null}
            <div className="lantern-face">{videoEl}</div>
            {pip && round && !camOff ? (
              <button
                type="button"
                className="lantern-pip-note"
                onClick={() => void document.exitPictureInPicture?.().catch(() => {})}
                aria-label="The teacher is in a floating window. Bring the picture back."
              >
                <PictureInPicture2 aria-hidden="true" className="size-5" />
                <span>Floating</span>
              </button>
            ) : null}
            {round && !camOff ? (
              <button
                type="button"
                aria-label={COPY.resizeCamera}
                title={COPY.cameraSize}
                className="lantern-resize"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onPointerDown(e, "resize");
                }}
                onClick={() => {
                  if (lastGestureMoved.current) return;
                  cycleLanternSize();
                }}
              >
                <span aria-hidden="true" className="lantern-grip" />
              </button>
            ) : null}
          </section>
        ) : null}

        {err ? (
          <div role="alert" className="absolute bottom-3 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-md bg-danger-subtle px-3 py-2 text-xs text-fg shadow-2">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-danger" />
            <span className="min-w-0 truncate">{err}</span>
            <Button size="sm" variant="secondary" onClick={retryClass}>
              {COPY.tryAgain}
            </Button>
          </div>
        ) : null}
        {!canPlay && !hlsUrl ? (
          <div role="alert" className="absolute bottom-3 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-warn-subtle px-3 py-2 text-xs text-fg shadow-2">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-warn" />
            <span className="min-w-0">
              <span className="font-medium">{COPY.cantPlayClass}.</span> {canPrepare ? COPY.cantPlayClassHint : COPY.prepareNeedsAdmin}
            </span>
            {canPrepare ? (
              <Button size="sm" onClick={() => setKeepOpen(true)}>
                {COPY.prepareForThisDevice}
              </Button>
            ) : null}
            {resolvedNotes ? (
              <Button size="sm" variant="secondary" asChild>
                <a href={resolvedNotes} target="_blank" rel="noreferrer">
                  {COPY.notes}
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
        {ended ? (
          <div role="status" className="absolute inset-0 z-[26] grid place-items-center bg-bg/85 p-6 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg bg-surface p-6 text-center shadow-3 [animation:ui-fade-in_var(--dur-base)_var(--ease-out)]">
              <p className="text-xs font-semibold tracking-[0.14em] text-fg-muted uppercase">Class finished</p>
              <p className="mt-2 font-serif text-xl text-fg [text-wrap:balance]">{title}</p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {nextLesson ? (
                  <Button
                    icon={SkipForward}
                    onClick={() => {
                      holdEnd.current = true;
                      openLesson(nextLesson);
                    }}
                  >
                    {COPY.nextClass}
                    {advanceLeft ? <span className="font-mono text-xs tabular-nums opacity-80">{advanceLeft}</span> : null}
                  </Button>
                ) : null}
                <Button variant="secondary" icon={RotateCcw} onClick={replayClass}>
                  {COPY.replay}
                </Button>
                <MarkDoneButton lessonId={timeline.id} title={title} />
              </div>
              {nextLesson && advanceLeft > 0 ? (
                <button type="button" className="mt-4 text-xs text-fg-muted hover:text-fg hover:underline" onClick={stayOnClass}>
                  {COPY.stay}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {isBoard && stripOn && timeline.slides.some((s: { url?: string }) => s.url) ? (
          <div className="slate-film is-side">
            <SlideStrip vertical slides={timeline.slides} currentUid={slide.uid} onJump={jumpSlide} pins={pins} />
          </div>
        ) : null}
      </div>

      {chaptersOpen ? (
        <StudyTray
          title={title}
          query={chapterQuery}
          onQuery={setChapterQuery}
          chapters={chapterList}
          onSeek={(t) => seek(t, true)}
          onClose={() => setChaptersOpen(false)}
          notes={revisionNotes()}
          summaryBusy={summaryBusy}
          onSummarize={() => void runSummary()}
          summary={summary}
          summaryNote={summaryNote}
        />
      ) : null}

      <PlayerTransport
        {...playerModel}
        prevLesson={playerModel.prevLesson ?? null}
        nextLesson={playerModel.nextLesson ?? null}
        slideUrl={sheet ? null : slideAt(timeline, (hoverT ?? 0) * 1000).url}
        listenLabel={COPY.listen}
        dataSaverLabel={COPY.dataSaver}
        audioSrc={playbackSrc}
      />
      {keepOpen ? (
        <SaveClassDialog
          lessonId={timeline.id}
          title={title}
          onClose={() => setKeepOpen(false)}
          onPrepared={(pack: PreparedMedia) => {
            if (pack.sprites) setSheet(pack.sprites);
            if (pack.audioUrl) setAudioUrl(pack.audioUrl);
            if (pack.hlsUrl) setHlsUrl(pack.hlsUrl);
            if (pack.silence) setSilence(pack.silence);
            if (pack.waveformUrl) setWaveform(pack.waveformUrl);
            if (pack.jobId) setJobId(pack.jobId);
            writePrepared(timeline.id, pack);
          }}
        />
      ) : null}
      {notesOpen && resolvedNotes ? (
        <NotesReader url={resolvedNotes} title={title} onClose={() => setNotesOpen(false)} />
      ) : null}
    </main>
    </>
  );
}

