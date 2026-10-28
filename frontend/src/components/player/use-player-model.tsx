import { useEffect, useMemo, useRef, type PointerEvent } from "react";
import { addBookmark, bookmarksFor } from "@inkboard/shared/planner/bookmarks";
import { focusProgress, readFocusRun } from "@inkboard/shared/planner/focus";
import { COPY } from "@inkboard/shared/copy";
import { apiJson } from "@/lib/api-client";
import {
  clampBox,
  formatTime,
  holdRate,
  nextPipSize,
  playGlyph,
  seekBarIntent,
  seekBarLayers,
  showSeekSpinner,
  timeFromClientX,
} from "@/components/player-controls";
import { DOUBLE_TAP_MS } from "@/components/class-player";
import { boardChapters, chapterHits, chaptersToVtt } from "@/lib/study";
import { bindMediaSession } from "@/components/player/media-session";

export function usePlayerModel<T extends Record<string, any>>(p: T) {
  const {
    ClassPlayer, advanceLeft, audioUrl, backTo, barDrag, boardBox, box, breakNudge,
    bufPct, bufferTimer, buffering, camOff, canPlay, chapterQuery, chapterTrack,
    chaptersOpen, chromeHidden, clipBusy, clipHref, clipIn, clipNote, clipOut, courseId,
    courseQ, dragRef, duration, educator, ended, err,
    flashT, flashTimer, focus, fromCourse, fs, help,
    hinted, hlsUrl, holdEnd, holdPlace, hoverT, idleTimer, introSec,
    isBoard, jobId, jumpSlide, keepOpen, lastTap, lastTick, layout,
    listen, liveCourse, moreOpen, muted, nav, nextLesson, notesOpen,
    notesUrl, openLesson, pinRev, pins, placeVideo, playIndex, playedMs,
    playing, playlist, prefs, prevLesson, qc,
    ready, resolvedNotes, resumeAt, resumed, round, saved, saver,
    scrubbing, seek, seekLock, seekLockAt, seekingUi, setAdvanceLeft, setAudioUrl, setBoardBox,
    setBox, setBreakNudge, setBufPct, setBuffering, setCamOff, setCanPlay, setChapterQuery, setChapterTrack,
    setChaptersOpen, setChromeHidden, setClipBusy, setClipHref, setClipIn, setClipNote, setClipOut, setDuration,
    setEnded, setErr, setFlashT, setFs, setHelp, setHlsUrl, setHoverT, setJobId,
    setKeepOpen, setLayout, setListen, setMoreOpen, setMuted, setNotesOpen, setPinRev, setPlaying,
    setReady, setResolvedNotes, setSaved, setSaver, setScrubbing, setSeekingUi, setSheet, setSilence,
    setSilenceOn, setSleepLeft, setSleepUntil, setSpeed, setStripOn, setSummary, setSummaryBusy, setSummaryNote,
    setTime, setVolume, setWaveform, sheet, silence, silenceOn, silenceOnRef, silenceRef,
    sleepLeft, sleepUntil, slide, slideCount, speed, sprites, stageRef, startAt, stripOn, summary, summaryBusy, summaryNote, tapTimer, teacherSlug,
    time, timeMs, timeSaved, timeline, title, toggleFs, userBoxRef, videoRef, volume, wantPlay, waveform, wrapRef,
  } = p;
  function stampNow() {
    addBookmark({ lessonId: timeline.id, title, seconds: time, note: "" });
    setPinRev((n: number) => n + 1);
  }

  /** True when the most recent lantern gesture actually travelled — a click right after a drag must not also cycle sizes. */
  const lastGestureMoved = useRef(false);

  /** Steps the camera through its preset sizes (small → large → small), keeping it inside the stage. */
  function cycleLanternSize() {
    const stage = stageRef.current;
    if (!stage || layout !== "pip") return;
    const rect = stage.getBoundingClientRect();
    userBoxRef.current = true;
    setBox((b: { x: number; y: number; w: number; h: number }) => {
      const s = nextPipSize(b.w);
      // grow/shrink around the bottom-right corner so the lantern stays where the eye expects it
      return clampBox({ x: b.x + b.w - s, y: b.y + b.h - s, w: s, h: s }, rect, true);
    });
  }

  function onPointerDown(e: PointerEvent, mode: "move" | "resize") {
    if (layout !== "pip") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    userBoxRef.current = true;
    lastGestureMoved.current = false;
    dragRef.current = {
      px: e.clientX,
      py: e.clientY,
      bx: box.x,
      by: box.y,
      bw: box.w,
      bh: box.h,
      mode,
      moved: false,
    };
  }

  function onPointerMove(e: PointerEvent) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    const dx = e.clientX - drag.px;
    const dy = e.clientY - drag.py;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      drag.moved = true;
      lastGestureMoved.current = true;
    }
    if (drag.mode === "move") {
      setBox((b: { x: number; y: number; w: number; h: number }) => clampBox({ ...b, x: drag.bx + dx, y: drag.by + dy }, rect, round));
    } else {
      setBox((b: { x: number; y: number; w: number; h: number }) => {
        const s = drag.bw + dx;
        return clampBox({ ...b, w: s, h: s }, rect, true);
      });
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved || drag.mode !== "move") return;
    const now = Date.now();
    if (now - lastTap.current < 320) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = 0;
      userBoxRef.current = false;
      setLayout((l: "pip" | "side") => (l === "pip" ? "side" : "pip"));
      return;
    }
    lastTap.current = now;
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => {
      if (camOff) {
        setCamOff(false);
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) {
        wantPlay.current = true;
        void v.play();
        setPlaying(true);
      } else {
        wantPlay.current = false;
        v.pause();
        setPlaying(false);
      }
    }, DOUBLE_TAP_MS);
  }

  const hideChrome = chromeHidden && playing && !help && !moreOpen;
  const shownTime = time;
  const barMax = duration > 1 ? duration : 1;
  const layers = seekBarLayers({
    played: shownTime,
    hover: hoverT ?? flashT,
    duration,
    dragging: scrubbing,
  });
  const glyph = playGlyph(playing, ended);
  const showBuffer = showSeekSpinner({
    ready,
    buffering,
    playing,
    previewing: hoverT != null || scrubbing,
    seeking: seekingUi,
  });
  const clockLabel = hoverT != null ? hoverT : shownTime;
  const previewing = hoverT != null;

  function timeFromBar(e: PointerEvent<HTMLElement>) {
    return timeFromClientX(e.clientX, e.currentTarget.getBoundingClientRect(), barMax);
  }

  function onBarPointer(phase: "move" | "down" | "up" | "leave", e: PointerEvent<HTMLElement>) {
    const t = timeFromBar(e);
    const intent = seekBarIntent(phase, barDrag.current, e.buttons);
    if (intent === "hover") {
      if (phase === "leave" && barDrag.current) return;
      setHoverT(t);
      return;
    }
    if (intent === "clear") {
      if (barDrag.current && phase === "leave") return;
      setHoverT(null);
      return;
    }
    if (intent === "scrub") {
      if (phase === "leave") return;
      if (phase === "down") {
        barDrag.current = true;
        setScrubbing(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      setHoverT(t);
      return;
    }
    barDrag.current = false;
    setScrubbing(false);
    setHoverT(null);
    seek(t);
  }

  const pipW = camOff && round ? 56 : box.w;
  const pipH = camOff && round ? 56 : box.h;
  const focusRun = focus ? focusProgress(readFocusRun()) : null;

  useEffect(() => {
    if (!ended || !nextLesson || holdEnd.current) {
      setAdvanceLeft(0);
      return;
    }
    setAdvanceLeft(8);
    const id = window.setInterval(() => {
      setAdvanceLeft((n: number) => {
        if (n <= 1) {
          window.clearInterval(id);
          openLesson(nextLesson);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [ended, nextLesson, openLesson]);

  function replayClass() {
    const v = videoRef.current;
    holdEnd.current = false;
    setEnded(false);
    setAdvanceLeft(0);
    setErr("");
    seek(0);
    if (v) void v.play();
  }

  function stayOnClass() {
    holdEnd.current = true;
    setAdvanceLeft(0);
    setEnded(false);
  }

  function retryClass() {
    const v = videoRef.current;
    setErr("");
    setEnded(false);
    if (!v) return;
    v.load();
    void v.play().catch(() => setErr(COPY.slateSlipped));
  }

  const chapters = useMemo(() => boardChapters(timeline), [timeline]);
  const studyMarks = useMemo(() => {
    const pins = bookmarksFor(timeline.id).map((b) => ({
      t: b.seconds,
      label: b.note.trim() || "Pin",
      uid: b.id,
    }));
    return [...chapters, ...pins].sort((a, b) => a.t - b.t);
  }, [chapters, timeline.id, pinRev]);
  const chapterList = useMemo(() => chapterHits(chapterQuery, studyMarks), [chapterQuery, studyMarks]);

  useEffect(() => {
    if (!chapters.length) {
      setChapterTrack("");
      return;
    }
    const url = URL.createObjectURL(new Blob([chaptersToVtt(chapters)], { type: "text/vtt" }));
    setChapterTrack(url);
    return () => URL.revokeObjectURL(url);
  }, [chapters]);

  function revisionNotes() {
    return bookmarksFor(timeline.id).map((b) => ({ seconds: b.seconds, note: b.note }));
  }

  async function runSummary() {
    const notes = revisionNotes().filter((n) => n.note.trim());
    if (!chapters.length && !notes.length) {
      setSummary(null);
      setSummaryNote("Nothing to summarize yet.");
      setChaptersOpen(true);
      return;
    }
    setSummaryBusy(true);
    setSummaryNote("");
    setChaptersOpen(true);
    try {
      const res = await apiJson<{ source: "board" | "model"; bullets: string[] }>("/api/study/summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          chapters: chapters.map((ch) => ({ t: ch.t, label: ch.label })),
          notes,
        }),
      });
      setSummary(res);
    } catch (err) {
      setSummary(null);
      setSummaryNote(err instanceof Error ? err.message : COPY.summaryFailed);
    } finally {
      setSummaryBusy(false);
    }
  }

  async function saveClip() {
    if (clipIn == null || clipOut == null) return;
    if (!jobId) {
      setClipNote(COPY.clipNeedsSave);
      return;
    }
    setClipBusy(true);
    setClipNote("");
    try {
      const res = await apiJson<{ url: string }>(`/api/jobs/${encodeURIComponent(jobId)}/clips`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ start: Math.min(clipIn, clipOut), end: Math.max(clipIn, clipOut) }),
      });
      setClipHref(res.url);
    } catch (err) {
      setClipNote(err instanceof Error ? err.message : COPY.clipNeedsSave);
    } finally {
      setClipBusy(false);
    }
  }

  const directSrc =
    listen && audioUrl ? audioUrl : saver ? undefined : canPlay && timeline.videoUrl ? timeline.videoUrl : undefined;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    return bindMediaSession(video, { title: title || "Class", artist: educator });
  }, [audioUrl, educator, listen, title, videoRef]);

  const videoEl = (
    <video
      ref={videoRef}
      src={directSrc}
      className={
        `${
          !isBoard
            ? "block h-full w-full object-contain bg-bg"
            : camOff
              ? "pointer-events-none absolute h-px w-px opacity-0"
              : round
                ? "pointer-events-none block h-full w-full object-cover"
                : "block h-full w-full object-contain bg-bg"
        }${listen ? " is-listen" : ""}`
      }
      playsInline
      controls={false}
      preload="metadata"
      onPointerDown={() => {
        const video = videoRef.current;
        if (video) video.playbackRate = holdRate(true, speed);
      }}
      onPointerUp={() => {
        const video = videoRef.current;
        if (video) video.playbackRate = holdRate(false, speed);
      }}
      onPointerCancel={() => {
        const video = videoRef.current;
        if (video) video.playbackRate = holdRate(false, speed);
      }}
    >
      {chapterTrack ? <track kind="chapters" src={chapterTrack} srcLang="en" label="Chapters" default /> : null}
      <track kind="captions" srcLang="en" label="Captions" />
    </video>
  );

  const lineUnder = breakNudge
    ? COPY.fortyStand
    : help
      ? COPY.keysHint
      : sleepUntil
        ? formatTime(sleepLeft)
        : timeSaved > 1
          ? `Saved ${formatTime(timeSaved)}`
        : [
            educator,
            fromCourse ? `from ${fromCourse}` : "",
            isBoard ? `${slide.i + 1}/${slideCount}` : "",
          ]
            .filter(Boolean)
            .join(" · ");

  return {
    ...p,
    stampNow, onPointerDown, onPointerMove, onPointerUp, onBarPointer, hideChrome, shownTime, barMax, cycleLanternSize, lastGestureMoved,
    layers, glyph, showBuffer, clockLabel, previewing, pipW, pipH, focusRun,
    replayClass, stayOnClass, retryClass, chapters, studyMarks, chapterList, revisionNotes, runSummary,
    saveClip, directSrc, videoEl, lineUnder,
  };
}
