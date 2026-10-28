import type { CSSProperties, Dispatch, PointerEvent, RefObject, SetStateAction } from "react";
import {
  Maximize2,
  Bookmark,
  BookmarkCheck,
  Camera,
  CameraOff,
  Captions,
  Download,
  FileText,
  Gauge,
  Headphones,
  ListTree,
  Maximize,
  Minimize,
  Moon,
  MoreHorizontal,
  Pause,
  PictureInPicture2,
  Pin,
  Play,
  RotateCcw,
  RotateCw,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { IconButton, Kbd, Menu, type MenuItem } from "@/components/ui";
import { SeekHover } from "@/components/seek-hover";
import { slideAt, type Timeline } from "@inkboard/shared/dcn";
import { toggleLater } from "@inkboard/shared/library";
import { COPY } from "@inkboard/shared/copy";
import { cycleSpeed, formatSpeed, formatTime, SLEEP_MINUTES, } from "@/components/player-controls";
import type { SpriteSheet } from "@/lib/sprite-sheet";
import type { SilenceRange } from "@/lib/study";
import { togglePictureInPicture } from "@/components/player/engine";
import type { UaLesson } from "@/lib/unacademy";
import { cn } from "@/lib/cn";

type Chapter = { uid: string; t: number; label: string };
type Layers = { hoverPct: number | null; fillPct: number };

export type PlayerTransportProps = {
  hideChrome: boolean;
  hoverT: number | null;
  scrubbing: boolean;
  onBarPointer: (phase: "move" | "down" | "up" | "leave", e: PointerEvent<HTMLElement>) => void;
  layers: Layers;
  sheet: SpriteSheet | null;
  timeline: Timeline;
  waveform: string | null;
  setWaveform: (v: string | null) => void;
  barMax: number;
  chapters: Chapter[];
  seek: (t: number, keep?: boolean) => void;
  clockLabel: number;
  shownTime: number;
  bufPct: number;
  duration: number;
  previewing: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  wantPlay: RefObject<boolean>;
  glyph: string;
  speed: number;
  setSpeed: Dispatch<SetStateAction<number>>;
  muted: boolean;
  setMuted: (v: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
  fs: boolean;
  toggleFs: () => void;
  audioUrl: string | null;
  listen: boolean;
  setListen: Dispatch<SetStateAction<boolean>>;
  holdPlace: () => void;
  hlsUrl: string | null;
  saver: boolean;
  setSaver: Dispatch<SetStateAction<boolean>>;
  stampNow: () => void;
  resolvedNotes: string;
  setNotesOpen: (v: boolean) => void;
  saved: boolean;
  setSaved: (v: boolean) => void;
  title: string;
  teacherSlug?: string;
  courseId?: string;
  moreOpen: boolean;
  setMoreOpen: (v: boolean) => void;
  camOff: boolean;
  setCamOff: Dispatch<SetStateAction<boolean>>;
  layout: "pip" | "side";
  setLayout: Dispatch<SetStateAction<"pip" | "side">>;
  cycleLanternSize?: () => void;
  isBoard: boolean;
  stripOn: boolean;
  setStripOn: Dispatch<SetStateAction<boolean>>;
  sleepUntil: number | null;
  setSleepUntil: Dispatch<SetStateAction<number | null>>;
  prevLesson: UaLesson | null;
  nextLesson: UaLesson | null;
  openLesson: (lesson: UaLesson) => void;
  setKeepOpen: (v: boolean) => void;
  setChaptersOpen: Dispatch<SetStateAction<boolean>>;
  runSummary: () => void;
  silenceOn: boolean;
  setSilenceOn: Dispatch<SetStateAction<boolean>>;
  silence: SilenceRange[];
  clipIn: number | null;
  clipOut: number | null;
  clipBusy: boolean;
  clipHref: string;
  clipNote: string;
  setClipIn: (v: number | null) => void;
  setClipOut: (v: number | null) => void;
  setClipHref: (v: string) => void;
  setClipNote: (v: string) => void;
  saveClip: () => void;
  slideUrl?: string | null;
  listenLabel?: string;
  dataSaverLabel?: string;
  audioSrc?: string;
};

/**
 * The transport: seek bar on top, one row of controls below.
 * Desktop: [play][−10][+10] time ──── [speed][mute+vol][cam][notes][later][pin][pip][fs][more]
 * Phone:   the row scrolls horizontally; secondary actions live in the ⋯ menu.
 */
export function PlayerTransport(props: PlayerTransportProps) {
  const {
    hideChrome, hoverT, scrubbing, onBarPointer, layers, sheet, timeline, waveform, setWaveform,
    barMax, chapters, seek, clockLabel, shownTime, bufPct, duration, previewing, videoRef, playing, setPlaying,
    wantPlay, glyph, speed, setSpeed, muted, setMuted, volume, setVolume, fs, toggleFs, audioUrl,
    listen, setListen, holdPlace, hlsUrl, saver, setSaver, stampNow, resolvedNotes, setNotesOpen,
    saved, setSaved, title, teacherSlug, courseId, moreOpen, setMoreOpen, camOff, setCamOff, layout,
    setLayout, cycleLanternSize, isBoard, stripOn, setStripOn, sleepUntil, setSleepUntil, prevLesson, nextLesson,
    openLesson, setKeepOpen, setChaptersOpen, runSummary, silenceOn, setSilenceOn, silence, clipIn,
    clipOut, clipBusy, clipHref, clipNote, setClipIn, setClipOut, setClipHref, setClipNote, saveClip,
    slideUrl, listenLabel = COPY.listen, dataSaverLabel = COPY.dataSaver, audioSrc,
  } = props;

  const hasStrip = timeline.slides.some((s) => s.url);
  const isMuted = muted || volume === 0;

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || !playing) {
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
  }
  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }
  function toggleSave() {
    setSaved(toggleLater({ lessonId: timeline.id, title, teacher: teacherSlug, course: courseId }));
  }

  const more: (MenuItem | "separator")[] = [
    ...(hasStrip && isBoard ? [{ id: "strip", label: stripOn ? COPY.hideSlides : COPY.showSlides, icon: Captions, onSelect: () => setStripOn((on) => !on), hint: "T" }] : []),
    ...(isBoard
      ? [
          { id: "cam", label: camOff ? COPY.showCamera : COPY.hideCamera, icon: camOff ? Camera : CameraOff, onSelect: () => setCamOff((on) => !on), hint: "C" },
          { id: "layout", label: layout === "pip" ? COPY.sideLayout : COPY.lanternLayout, icon: PictureInPicture2, onSelect: () => setLayout((cur) => (cur === "pip" ? "side" : "pip")) },
          ...(layout === "pip" && !camOff && cycleLanternSize ? [{ id: "cam-size", label: COPY.cameraSize, icon: Maximize2, onSelect: cycleLanternSize }] : []),
        ]
      : []),
    ...(audioUrl || audioSrc
      ? [{ id: "listen", label: listen ? COPY.showVideo : listenLabel, icon: Headphones, checked: listen, onSelect: () => { holdPlace(); setListen((on) => !on); } }]
      : []),
    ...(hlsUrl
      ? [{ id: "saver", label: saver ? COPY.originalVideo : dataSaverLabel, icon: Gauge, checked: saver, onSelect: () => { holdPlace(); setListen(false); setSaver((on) => !on); } }]
      : []),
    ...(silence.length ? [{ id: "silence", label: silenceOn ? COPY.keepSilence : COPY.skipSilence, icon: Waves, checked: silenceOn, onSelect: () => setSilenceOn((on) => !on) }] : []),
    { id: "sleep", label: COPY[sleepUntil ? "cancelSleep" : "sleep15"], icon: Moon, checked: Boolean(sleepUntil), onSelect: () => setSleepUntil((cur) => (cur ? null : Date.now() + SLEEP_MINUTES * 60_000)) },
    "separator",
    ...(chapters.length ? [{ id: "chapters", label: COPY.chapters, icon: ListTree, onSelect: () => setChaptersOpen((open) => !open) }] : []),
    { id: "summarize", label: COPY.summarize, icon: Sparkles, onSelect: () => void runSummary() },
    { id: "keep", label: COPY.keepThisClass, icon: Download, onSelect: () => setKeepOpen(true) },
    "separator",
    { id: "clip-in", label: `${COPY.markIn}${clipIn != null ? ` · ${formatTime(clipIn)}` : ""}`, icon: Scissors, onSelect: () => { setClipIn(shownTime); setClipHref(""); setClipNote(""); } },
    { id: "clip-out", label: `${COPY.markOut}${clipOut != null ? ` · ${formatTime(clipOut)}` : ""}`, icon: Scissors, onSelect: () => { setClipOut(shownTime); setClipHref(""); setClipNote(""); } },
    ...(clipIn != null && clipOut != null
      ? [{ id: "clip-save", label: clipBusy ? COPY.savingClip : clipHref ? COPY.clipReady : COPY.saveClip, icon: Download, onSelect: () => (clipHref ? window.open(clipHref, "_blank", "noreferrer") : void saveClip()) }]
      : []),
    ...(prevLesson || nextLesson ? ["separator" as const] : []),
    ...(prevLesson ? [{ id: "prev", label: COPY.prevClass, icon: SkipBack, onSelect: () => openLesson(prevLesson), hint: "P" }] : []),
    ...(nextLesson ? [{ id: "next", label: COPY.nextClass, icon: SkipForward, onSelect: () => openLesson(nextLesson), hint: "N" }] : []),
  ];

  return (
    <div className="player-chrome absolute inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-sm" data-idle={hideChrome || undefined}>
      {/* ---- seek bar ---- */}
      <div
        className="seek-hit"
        data-hot={hoverT != null || scrubbing || undefined}
        onPointerDown={(e) => onBarPointer("down", e)}
        onPointerMove={(e) => onBarPointer("move", e)}
        onPointerUp={(e) => onBarPointer("up", e)}
        onPointerCancel={(e) => onBarPointer("leave", e)}
        onPointerLeave={(e) => onBarPointer("leave", e)}
      >
        <div className="relative flex h-full w-full items-center">
          {layers.hoverPct != null && hoverT != null ? (
            <SeekHover
              pct={layers.hoverPct}
              label={formatTime(hoverT)}
              time={hoverT}
              sheet={sheet}
              slideUrl={slideUrl !== undefined ? slideUrl : sheet ? null : slideAt(timeline, hoverT * 1000).url}
            />
          ) : null}
          {waveform ? <img src={waveform} alt="" className="seek-wave" onError={() => setWaveform(null)} /> : null}
          {layers.hoverPct != null ? <span className="seek-ghost" style={{ left: `${layers.hoverPct}%` }} aria-hidden="true" /> : null}
          <span className="seek-head" style={{ left: `${layers.fillPct}%` }} aria-hidden="true" />
          {barMax > 0
            ? chapters.map((ch) => (
                <button
                  key={`${ch.uid}-${Math.round(ch.t * 10)}`}
                  type="button"
                  className="seek-chapter"
                  style={{ left: `${Math.min(100, (ch.t / barMax) * 100)}%` }}
                  title={`${ch.label} · ${formatTime(ch.t)}`}
                  aria-label={`${ch.label} ${formatTime(ch.t)}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    seek(ch.t, true);
                  }}
                />
              ))
            : null}
          <input
            type="range"
            min={0}
            max={barMax}
            step={0.1}
            value={Math.min(scrubbing && hoverT != null ? hoverT : shownTime, barMax)}
            aria-label="Seek"
            aria-valuetext={formatTime(clockLabel)}
            tabIndex={-1}
            onChange={() => {}}
            className="seek-track"
            style={{ ["--seek"]: `${layers.fillPct}%`, ["--buf"]: `${Math.max(bufPct, layers.fillPct)}%` } as CSSProperties}
          />
        </div>
      </div>

      {/* ---- controls row ---- */}
      <div className="flex h-12 items-center gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none] sm:px-2.5">
        <IconButton label={glyph === "pause" ? "Pause" : "Play"} icon={glyph === "pause" ? Pause : Play} onClick={togglePlay} className="text-fg" />
        <IconButton label="Back 10s" icon={RotateCcw} onClick={() => seek(shownTime - 10, true)} />
        <IconButton label="Forward 10s" icon={RotateCw} onClick={() => seek(shownTime + 10, true)} />
        <span className={cn("shrink-0 px-2 font-mono text-xs tabular-nums", previewing ? "text-accent" : "text-fg-muted")} aria-live="polite">
          {formatTime(clockLabel)}
          <span className="text-fg-faint"> / {formatTime(duration)}</span>
        </span>

        <span className="hidden min-w-0 flex-1 items-center justify-center gap-1 text-[11px] text-fg-faint xl:flex" title={COPY.shortcuts}>
          <span className="rail-keys">{COPY.keysHint}</span>
          <Kbd>?</Kbd>
        </span>
        <span className="flex-1 xl:hidden" />

        <button
          type="button"
          onClick={() => setSpeed((s) => cycleSpeed(s))}
          aria-label={`Speed ${formatSpeed(speed)}×`}
          title={`Speed ${formatSpeed(speed)}× (S)`}
          className="h-8 shrink-0 rounded-md px-2 font-mono text-xs text-fg-muted tabular-nums hover:bg-surface-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {formatSpeed(speed)}×
        </button>

        <div className="group/vol flex shrink-0 items-center">
          <IconButton label={isMuted ? "Unmute" : "Mute"} icon={isMuted ? VolumeX : Volume2} onClick={toggleMute} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="Volume"
            className="volume-track mr-1 hidden md:block"
            style={{ ["--vol"]: `${(muted ? 0 : volume) * 100}%` } as CSSProperties}
            onChange={(e) => {
              const next = Number(e.target.value);
              setVolume(next);
              setMuted(next === 0);
            }}
          />
        </div>

        {isBoard ? (
          <IconButton label={camOff ? COPY.showCamera : COPY.hideCamera} icon={camOff ? CameraOff : Camera} pressed={!camOff} onClick={() => setCamOff((on) => !on)} className="hidden sm:inline-flex" />
        ) : null}
        {resolvedNotes ? <IconButton label={COPY.readNotes} icon={FileText} onClick={() => setNotesOpen(true)} className="hidden sm:inline-flex" /> : null}
        <IconButton label={saved ? COPY.folded : COPY.fold} icon={saved ? BookmarkCheck : Bookmark} pressed={saved} onClick={toggleSave} className="hidden sm:inline-flex" />
        <IconButton label="Pin this moment" icon={Pin} onClick={stampNow} className="hidden sm:inline-flex" />
        <IconButton
          label="PiP"
          icon={PictureInPicture2}
          onClick={() => {
            const v = videoRef.current;
            if (v) void togglePictureInPicture(v, document);
          }}
          className="hidden lg:inline-flex"
        />
        <IconButton label={fs ? COPY.exitFullscreen : COPY.fullscreen} icon={fs ? Minimize : Maximize} onClick={toggleFs} />
        <Menu
          label={COPY.moreControls}
          side="top"
          open={moreOpen}
          onOpenChange={setMoreOpen}
          header={
            <div className="flex items-center gap-2 sm:hidden">
              <IconButton label={isMuted ? "Unmute" : "Mute"} icon={isMuted ? VolumeX : Volume2} size="sm" onClick={toggleMute} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-label="Volume"
                className="volume-track flex-1"
                style={{ ["--vol"]: `${(muted ? 0 : volume) * 100}%` } as CSSProperties}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setVolume(next);
                  setMuted(next === 0);
                }}
              />
            </div>
          }
          items={[
            ...(resolvedNotes ? [{ id: "notes", label: COPY.readNotes, icon: FileText, onSelect: () => setNotesOpen(true) }] : []),
            { id: "save", label: saved ? COPY.unfold : COPY.fold, icon: saved ? BookmarkCheck : Bookmark, checked: saved, onSelect: toggleSave, hint: "B" },
            { id: "pin", label: "Pin this moment", icon: Pin, onSelect: stampNow, hint: "I" },
            "separator",
            ...more,
          ]}
          trigger={(t) => <IconButton {...t} label={COPY.moreControls} icon={MoreHorizontal} />}
        />
      </div>
    </div>
  );
}
