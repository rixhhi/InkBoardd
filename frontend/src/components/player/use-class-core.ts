import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlayback } from "@/components/player/use-playback";
import { usePlayerSession } from "@/components/player/use-player-session";
import { notesHref } from "@inkboard/shared/notes";
import { firstInkSec, isBoardClass, slideAt, type Timeline } from "@inkboard/shared/dcn";
import { loadLessonTimeline, resolveLessonNotes } from "@/lib/lesson-api";
import { readPlayerPrefs } from "@inkboard/shared/player-prefs";
import { isLater } from "@inkboard/shared/library";
import { courseQueryOptions, type UaLesson } from "@/lib/unacademy";
import { catalogState } from "@/lib/catalog-status";
import { bookmarksFor } from "@inkboard/shared/planner/bookmarks";
import { rebatePins, type Box } from "@/components/player-controls";
import { readPrepared } from "@/lib/prepared-media";
import type { SpriteSheet } from "@/lib/sprite-sheet";

type VideoLayout = "pip" | "side";

export function useClassCore(props: {
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
  const { timeline, title, teacherSlug, courseId, courseSlug, notesUrl, startAt, focus, sprites } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    px: number;
    py: number;
    bx: number;
    by: number;
    bw: number;
    bh: number;
    mode: "move" | "resize";
    moved: boolean;
  } | null>(null);
  const userBoxRef = useRef(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const prefs = useMemo(() => readPlayerPrefs(), []);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(() => Math.max(0, timeline.durationMs / 1000));
  const [muted, setMuted] = useState(prefs.muted);
  const [volume, setVolume] = useState(prefs.volume);
  const [speed, setSpeed] = useState(prefs.speed);
  const [fs, setFs] = useState(false);
  const [layout, setLayout] = useState<VideoLayout>(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "pip" : prefs.layout,
  );
  const [camOff, setCamOff] = useState(prefs.camOff);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const [boardBox, setBoardBox] = useState<Box>({ x: 8, y: 8, w: 0, h: 0 });
  const [, setSideStrip] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [help, setHelp] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [stripOn, setStripOn] = useState(true);
  const [sleepUntil, setSleepUntil] = useState<number | null>(null);
  const [sleepLeft, setSleepLeft] = useState(0);
  const [timeSaved, setTimeSaved] = useState(0);
  const idleTimer = useRef<number>(0);
  const lastTap = useRef(0);
  const tapTimer = useRef<number>(0);
  const hinted = useRef(false);
  const [saved, setSaved] = useState(() => isLater(timeline.id));
  const [breakNudge, setBreakNudge] = useState(false);
  const playedMs = useRef(0);
  const lastTick = useRef<number | null>(null);
  const [resolvedNotes, setResolvedNotes] = useState<string>(notesUrl ? notesHref({ url: notesUrl }) : "");
  const resumed = useRef(false);
  const holdEnd = useRef(false);
  const seekLock = useRef<number | null>(null);
  const seekLockAt = useRef(0);
  const barDrag = useRef(false);
  const wantPlay = useRef(false);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [flashT, setFlashT] = useState<number | null>(null);
  const [bufPct, setBufPct] = useState(0);
  const flashTimer = useRef(0);
  const session = usePlayerSession(timeline.id, sprites, videoRef);
  const [pinRev, setPinRev] = useState(0);

  useEffect(() => {
    const saved = readPrepared(timeline.id);
    if (!saved) return;
    if (saved.sprites) session.setSheet(saved.sprites);
    if (saved.audioUrl) session.setAudioUrl(saved.audioUrl);
    if (saved.hlsUrl) session.setHlsUrl(saved.hlsUrl);
    if (saved.silence?.length) session.setSilence(saved.silence);
    if (saved.waveformUrl) session.setWaveform(saved.waveformUrl);
    if (saved.jobId) session.setJobId(saved.jobId);
  }, [timeline.id]);

  function holdPlace() {
    const v = videoRef.current;
    session.resumeAt.current = { t: v?.currentTime || time, play: Boolean(v && !v.paused) };
  }

  const timeMs = time * 1000;
  const slide = slideAt(timeline, timeMs);
  const slideCount = Math.max(1, timeline.slides.length);
  const introSec = firstInkSec(timeline);
  const isBoard = isBoardClass(timeline);
  const round = isBoard;
  const pins = useMemo(
    () => rebatePins(timeline.slides, bookmarksFor(timeline.id)),
    [timeline.slides, timeline.id, pinRev],
  );

  const liveCourse = Boolean(courseId && /^[A-Za-z0-9]{4,16}$/.test(courseId));
  const courseQ = useQuery({
    ...courseQueryOptions(courseId ?? "", courseSlug, teacherSlug),
    enabled: liveCourse,
  });
  const playlist = useMemo(
    () => (courseQ.data?.lessons ?? []).filter((l) => l.replayId),
    [courseQ.data?.lessons],
  );
  const playIndex = playlist.findIndex((l) => l.replayId === timeline.id);
  const prevLesson = playIndex > 0 ? playlist[playIndex - 1] : undefined;
  const nextLesson = playIndex >= 0 ? playlist[playIndex + 1] : undefined;

  const openLesson = useCallback(
    (lesson: UaLesson) => {
      if (!lesson.replayId) return;
      void nav({
        to: "/play/$lessonId",
        params: { lessonId: lesson.replayId },
        search: { title: lesson.title, teacher: teacherSlug, course: courseId },
      });
    },
    [nav, teacherSlug, courseId],
  );

  useEffect(() => {
    if (!nextLesson?.replayId) return;
    if (catalogState().status === "down") return;
    const dur = timeline.durationMs / 1000;
    if (!(dur > 0) || time / dur < 0.6) return;
    void qc.prefetchQuery({
      queryKey: ["lesson", "v2", nextLesson.replayId],
      queryFn: ({ signal }) => loadLessonTimeline({ data: { id: nextLesson.replayId! }, signal }),
    });
  }, [nextLesson?.replayId, qc, time, timeline.durationMs]);

  useEffect(() => {
    if (notesUrl) {
      setResolvedNotes(notesHref({ url: notesUrl }));
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    void resolveLessonNotes({ data: { id: timeline.id, title }, signal: ac.signal })
      .then((hit) => {
        if (cancelled || !hit) return;
        setResolvedNotes(notesHref({ url: hit.url }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [timeline.id, title, notesUrl]);

  useEffect(() => {
    const fromTl = timeline.durationMs / 1000;
    if (!(fromTl > 1)) return;
    setDuration((d) => (Number.isFinite(d) && d > fromTl ? d : fromTl));
  }, [timeline.durationMs]);

  const { seek, toggleFs, jumpSlide } = usePlayback({
    videoRef, wrapRef, barDrag, seekLock, seekLockAt,
    silenceOnRef: session.silenceOnRef, silenceRef: session.silenceRef, bufferTimer: session.bufferTimer,
    resumeAt: session.resumeAt, resumed, wantPlay, playedMs, lastTick, idleTimer, hinted, flashTimer,
    setTime, setBufPct, setSeekingUi: session.setSeekingUi, setDuration, setReady, setErr, setBuffering: session.setBuffering, setPlaying,
    setEnded: session.setEnded, setFlashT, setSpeed, setMuted, setSaved, setCamOff, setStripOn, setChromeHidden,
    setHelp, setSleepUntil, setSleepLeft, setTimeSaved, setFs, setBreakNudge,
    timeline, startAt, title, teacherSlug, courseId, isBoard, duration, nextLesson, prevLesson,
    openLesson, focus, nav, introSec, slideUid: slide.uid, playing, help, breakNudge, speed, volume,
    muted, camOff, layout, sleepUntil,
  });

  const resumeAt = session.resumeAt;

  return {
    ...props,
    ...session,
    videoRef, wrapRef, stageRef, dragRef, userBoxRef, nav, qc, prefs,
    playing, setPlaying, time, setTime, duration, setDuration, muted, setMuted, volume, setVolume,
    speed, setSpeed, fs, setFs, layout, setLayout, camOff, setCamOff, box, setBox, boardBox, setBoardBox,
    setSideStrip, ready, setReady, err, setErr, help, setHelp, chromeHidden, setChromeHidden,
    stripOn, setStripOn, sleepUntil, setSleepUntil, sleepLeft, setSleepLeft, timeSaved,
    idleTimer, lastTap, tapTimer, hinted, saved, setSaved, breakNudge, setBreakNudge,
    playedMs, lastTick, resolvedNotes, setResolvedNotes, resumed, holdEnd, seekLock, seekLockAt,
    barDrag, wantPlay, hoverT, setHoverT, scrubbing, setScrubbing, flashT, setFlashT, bufPct, setBufPct, flashTimer,
    pinRev, setPinRev, holdPlace, timeMs, slide, slideCount, introSec, isBoard, round, pins,
    liveCourse, courseQ, playlist, playIndex, prevLesson, nextLesson, openLesson,
    seek, toggleFs, jumpSlide, resumeAt,
  };
}
