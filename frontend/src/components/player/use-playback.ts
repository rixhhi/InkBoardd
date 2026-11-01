/*
 * biome-ignore-all lint/correctness/useExhaustiveDependencies: this hook binds the
 * <video> element's events once per source. Every name the rule wants listed is a
 * RefObject or a useState setter from useClassCore — stable for the component's
 * lifetime by React contract — and the two it wants removed (timeline.videoUrl,
 * isBoard) are the deliberate "source changed, re-bind" triggers. Listing
 * `ref.current` in a deps array would read refs during render, which is the bug
 * this rule exists to prevent.
 */
import { useCallback, useEffect, useRef, } from "react";
import { shouldNudgeBreak } from "@inkboard/shared/planner/focus";
import { writePlayerPrefs } from "@inkboard/shared/player-prefs";
import { toggleLater } from "@inkboard/shared/library";
import { peekProgress, saveProgress } from "@inkboard/shared/watch-history";
import { useWatchBeacon } from "@/lib/session";
import { rememberPlace } from "@inkboard/shared/favourites";
import { completeLessonInPlan } from "@inkboard/shared/planner/storage";
import { PLAYER_HELP_MS, PLAYER_IDLE_MS } from "@inkboard/shared/hand";
import { COPY } from "@inkboard/shared/copy";
import { lockPitch, mediaErrorMessage, otherTabStarted, shouldReapplyRate } from "@/components/player/engine";
import { getExam } from "@inkboard/shared/exams";
import { readExamId } from "@inkboard/shared/exam-pref";
import {
  assignMediaTime,
  addSilenceSaved,
  clampSeek,
  jumpSlideTime,
  mediaDuration,
  nextSlideUid,
  playerHotkey,
  stepSpeed,
  followMediaClock,
  SEEK_HOLD_MS,
  bufferedPct,
  keepPlayingAfterSeek,
  SLEEP_MINUTES,
  sleepLeftMs,
} from "@/components/player-controls";
import { skipSilenceTo, } from "@/lib/study";

import type { PlaybackBag } from "@/components/player/playback-bag";

export function usePlayback(p: PlaybackBag) {
  const {
    videoRef, wrapRef, barDrag, seekLock, seekLockAt, silenceOnRef, silenceRef, bufferTimer,
    resumeAt, resumed, wantPlay, playedMs, lastTick, idleTimer, hinted, flashTimer,
    setTime, setBufPct, setSeekingUi, setDuration, setReady, setErr, setBuffering, setPlaying,
    setEnded, setFlashT, setSpeed, setMuted, setSaved, setCamOff, setStripOn, setChromeHidden,
    setHelp, setSleepUntil, setSleepLeft, setTimeSaved, setFs, setBreakNudge,
    timeline, startAt, title, teacherSlug, courseId, isBoard, duration, nextLesson, prevLesson,
    openLesson, focus, nav, introSec, slideUid, playing, help, breakNudge, speed, volume,
    muted, camOff, layout, sleepUntil,
  } = p;
  // Report real watch time to the admin's activity view (playing + visible only).
  useWatchBeacon(timeline.id, title, playing);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const applyRate = () => {
      if (shouldReapplyRate(speedRef.current, v.playbackRate)) lockPitch(v, speedRef.current);
    };
    let raf = 0;
    let lastUi = 0;
    const follow = () => {
      if (barDrag.current) return;
      const media = Number.isFinite(v.currentTime) ? v.currentTime : 0;
      const next = followMediaClock({
        mediaSec: media,
        targetSec: seekLock.current,
        seeking: v.seeking,
        paused: v.paused,
        lockAgeMs: seekLock.current != null ? performance.now() - seekLockAt.current : SEEK_HOLD_MS,
      });
      if (next.clearLock && seekLock.current != null) {
        seekLock.current = null;
        setSeekingUi(false);
      }
      setTime(next.time);
      setBufPct(bufferedPct(v.buffered, mediaDuration(v.duration, timeline.durationMs / 1000)));
      if (silenceOnRef.current && !barDrag.current && !v.paused && !v.seeking) {
        const jump = skipSilenceTo(media, silenceRef.current);
        if (jump != null && jump - media > 0.2) {
          setTimeSaved((saved) => addSilenceSaved(saved, media, jump));
          seekLock.current = jump;
          seekLockAt.current = performance.now();
          setTime(jump);
          assignMediaTime(v, jump);
        }
      }
    };
    const tick = () => {
      const now = performance.now();
      if (now - lastUi > 80) {
        lastUi = now;
        follow();
      }
      if (!v.paused && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const startLoop = () => {
      cancelAnimationFrame(raf);
      if (!v.paused && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      cancelAnimationFrame(raf);
      follow();
    };
    const applyDuration = () => {
      const cap = mediaDuration(v.duration, timeline.durationMs / 1000);
      if (cap > 0) setDuration(cap);
    };
    const clearBuffer = () => {
      window.clearTimeout(bufferTimer.current);
      setBuffering(false);
      setSeekingUi(false);
    };
    const armSeek = (t: number) => {
      seekLock.current = t;
      seekLockAt.current = performance.now();
      setTime(t);
    };
    const onMeta = () => {
      applyRate();
      applyDuration();
      setReady(true);
      setErr("");
      clearBuffer();
      const held = resumeAt.current;
      if (held) {
        resumeAt.current = null;
        if (Number.isFinite(held.t) && held.t > 0.2) {
          armSeek(held.t);
          assignMediaTime(v, held.t);
        }
        if (held.play) {
          wantPlay.current = true;
          void v.play().catch(() => {
            wantPlay.current = false;
          });
        }
        return;
      }
      if (!resumed.current) {
        resumed.current = true;
        const fromUrl = startAt && startAt > 1 ? startAt : 0;
        const t = fromUrl || peekProgress(timeline.id);
        const cap = mediaDuration(v.duration, timeline.durationMs / 1000);
        if (t > 1 && (cap <= 0 || t < cap - 4)) {
          armSeek(t);
          assignMediaTime(v, t);
        }
      }
    };
    const onErr = () => setErr(mediaErrorMessage(v.error?.code) || COPY.slateSlipped);
    const onWaiting = () => {
      if (barDrag.current || v.seeking) return;
      window.clearTimeout(bufferTimer.current);
      bufferTimer.current = window.setTimeout(() => {
        if (v.paused || v.readyState >= 3) return;
        setBuffering(true);
      }, 280);
    };
    const onPlaying = () => {
      applyRate();
      wantPlay.current = true;
      setPlaying(true);
      clearBuffer();
      setEnded(false);
      startLoop();
    };
    const onPause = () => {
      if (barDrag.current) return;
      if (v.seeking && wantPlay.current) return;
      if (wantPlay.current) {
        void v.play().catch(() => {
          wantPlay.current = false;
          setPlaying(false);
          clearBuffer();
          stopLoop();
        });
        return;
      }
      setPlaying(false);
      clearBuffer();
      stopLoop();
    };
    const onTime = () => {
      if (barDrag.current) return;
      follow();
      if (!v.paused && !document.hidden) startLoop();
    };
    const onSeeking = () => {
      setSeekingUi(true);
    };
    const onSeeked = () => {
      clearBuffer();
      follow();
      keepPlayingAfterSeek(v, wantPlay.current)?.catch(() => {
        wantPlay.current = false;
        setPlaying(false);
        clearBuffer();
      });
      if (wantPlay.current) {
        setPlaying(true);
        startLoop();
      }
    };
    const onCanPlay = () => {
      applyRate();
      window.clearTimeout(bufferTimer.current);
      setBuffering(false);
      if (!v.seeking) setSeekingUi(false);
    };
    const onEnded = () => {
      stopLoop();
      wantPlay.current = false;
      setEnded(true);
      setPlaying(false);
      clearBuffer();
      completeLessonInPlan(timeline.id, "auto");
      saveProgress({
        lessonId: timeline.id,
        title,
        teacher: teacherSlug,
        course: courseId,
        t: v.duration,
        duration: v.duration,
      });
      rememberPlace({
        lessonId: timeline.id,
        title,
        teacher: teacherSlug || "",
        courseId: courseId || "",
        t: v.duration,
        duration: v.duration,
      });
    };
    const onVis = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", applyDuration);
    v.addEventListener("error", onErr);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onVis);
    if (v.readyState >= 1) onMeta();
    startLoop();
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", applyDuration);
      v.removeEventListener("error", onErr);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVis);
      window.clearTimeout(bufferTimer.current);
    };
  }, [timeline.videoUrl, timeline.id, timeline.durationMs, startAt, title, teacherSlug, courseId, isBoard]);

  useEffect(() => {
    if (!playing) {
      lastTick.current = null;
      return;
    }
    const id = window.setInterval(() => {
      const now = performance.now();
      if (lastTick.current != null) playedMs.current += now - lastTick.current;
      lastTick.current = now;
      if (shouldNudgeBreak(playedMs.current, breakNudge)) setBreakNudge(true);
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing, breakNudge]);

  useEffect(() => {
    const persist = () => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(v.duration)) return;
      const examId = readExamId() || undefined;
      const exam = examId ? getExam(examId) : null;
      saveProgress({
        lessonId: timeline.id,
        title,
        teacher: teacherSlug,
        course: courseId,
        examId,
        examName: exam?.name,
        t: v.currentTime,
        duration: v.duration,
      });
      rememberPlace({
        lessonId: timeline.id,
        title,
        teacher: teacherSlug || "",
        courseId: courseId || "",
        t: v.currentTime,
        duration: v.duration,
      });
    };
    const id = window.setInterval(persist, 4000);
    window.addEventListener("pagehide", persist);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", persist);
      persist();
    };
  }, [timeline.id, title, teacherSlug, courseId]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) lockPitch(v, speed);
    writePlayerPrefs({ speed, volume, muted, camOff, layout });
  }, [speed, volume, muted, camOff, layout]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const id = `${timeline.id}:${Math.random().toString(36).slice(2)}`;
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel("inkboard-player");
    } catch {
      return;
    }
    const onMsg = (event: MessageEvent) => {
      if (!otherTabStarted(event.data, id)) return;
      const media = videoRef.current;
      if (!media || media.paused) return;
      wantPlay.current = false;
      media.pause();
    };
    channel.addEventListener("message", onMsg);
    const onPlaying = () => channel.postMessage({ type: "inkboard-play", id });
    const media = videoRef.current;
    media?.addEventListener("playing", onPlaying);
    return () => {
      channel.removeEventListener("message", onMsg);
      media?.removeEventListener("playing", onPlaying);
      channel.close();
    };
  }, [timeline.id, videoRef, wantPlay]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted]);

  function toggleFs() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }

  const seek = useCallback((next: number, flash = false) => {
    const v = videoRef.current;
    const cap = mediaDuration(v && Number.isFinite(v.duration) ? v.duration : Number.NaN, duration);
    const t = clampSeek(next, cap);
    setTime(t);
    if (flash) {
      setFlashT(t);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashT(null), 900);
    }
    if (!v) return;
    const resume = wantPlay.current || !v.paused;
    wantPlay.current = resume;
    seekLock.current = t;
    seekLockAt.current = performance.now();
    assignMediaTime(v, t);
    keepPlayingAfterSeek(v, resume);
  }, [duration]);

  const jumpSlide = useCallback((uid: string) => {
    const t = jumpSlideTime(timeline, uid);
    if (t != null) seek(t);
  }, [timeline, seek]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      const action = playerHotkey(e, e.target as HTMLElement | null, {
        hasNext: Boolean(nextLesson),
        hasPrev: Boolean(prevLesson),
      });
      if (!action) return;
      if ("preventDefault" in action && action.preventDefault) e.preventDefault();
      if (action.type === "togglePlay") {
        e.preventDefault();
        if (v.paused) {
          wantPlay.current = true;
          setPlaying(true);
          void v.play().catch(() => {
            wantPlay.current = false;
            setPlaying(false);
          });
        } else {
          wantPlay.current = false;
          v.pause();
          setPlaying(false);
        }
      } else if (action.type === "seekBy") {
        seek((seekLock.current ?? v.currentTime) + action.seconds, true);
      } else if (action.type === "fullscreen") {
        toggleFs();
        setStripOn(false);
        setChromeHidden(true);
      } else if (action.type === "toggleCam") {
        if (!isBoard) return;
        setCamOff((on) => !on);
      } else if (action.type === "toggleMute") {
        v.muted = !v.muted;
        setMuted(v.muted);
      } else if (action.type === "speed") {
        setSpeed((s) => stepSpeed(s, action.dir));
      } else if (action.type === "later") {
        setSaved(toggleLater({ lessonId: timeline.id, title, teacher: teacherSlug, course: courseId }));
      } else if (action.type === "next" && nextLesson) {
        openLesson(nextLesson);
      } else if (action.type === "prev" && prevLesson) {
        openLesson(prevLesson);
      } else if (action.type === "seekFraction") {
        const cap = mediaDuration(v.duration, duration);
        seek(cap > 0 ? cap * action.frac : 0);
      } else if (action.type === "help") {
        setHelp(true);
      } else if (action.type === "slidePrev" || action.type === "slideNext") {
        const uid = nextSlideUid(timeline.switches, slideUid, action.type === "slideNext" ? 1 : -1);
        if (uid) jumpSlide(uid);
      } else if (action.type === "toggleStrip") {
        setStripOn((on) => !on);
      } else if (action.type === "skipIntro") {
        if (introSec > 0) seek(introSec);
      } else if (action.type === "sleep") {
        setSleepUntil((cur) => (cur ? null : Date.now() + SLEEP_MINUTES * 60_000));
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !focus) return;
      e.preventDefault();
      void nav({ to: "/planner/today", search: { add: undefined } });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onEsc);
    };
  }, [duration, nextLesson, prevLesson, openLesson, timeline.id, timeline.switches, isBoard, title, teacherSlug, courseId, focus, nav, introSec, slideUid, seek, jumpSlide]);

  useEffect(() => {
    const bump = () => {
      setChromeHidden(false);
      window.clearTimeout(idleTimer.current);
      if (!playing || help) return;
      idleTimer.current = window.setTimeout(() => setChromeHidden(true), PLAYER_IDLE_MS);
    };
    bump();
    window.addEventListener("pointermove", bump);
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.clearTimeout(idleTimer.current);
      window.removeEventListener("pointermove", bump);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [playing, help]);

  useEffect(() => {
    if (playing && !hinted.current) {
      hinted.current = true;
      setHelp(true);
    }
  }, [playing]);

  useEffect(() => {
    if (!help) return;
    const id = window.setTimeout(() => setHelp(false), PLAYER_HELP_MS);
    return () => window.clearTimeout(id);
  }, [help]);

  useEffect(() => {
    if (!sleepUntil) {
      setSleepLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.ceil(sleepLeftMs(sleepUntil - SLEEP_MINUTES * 60_000, Date.now(), SLEEP_MINUTES) / 1000);
      setSleepLeft(left);
      if (left <= 0) {
        const v = videoRef.current;
        if (v && !v.paused) v.pause();
        setSleepUntil(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [sleepUntil]);

  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  return { seek, toggleFs, jumpSlide };
}
