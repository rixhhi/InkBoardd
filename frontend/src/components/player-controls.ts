import { fit16x9 } from "./whiteboard-paint.ts";

export const PLAYER_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const PIP_SIZES = [96, 140, 188, 244] as const;

export type Box = { x: number; y: number; w: number; h: number };
export type StageSize = { width: number; height: number };

/** Absolute box that never leaves a stale `right`/`bottom` from the previous layout. */
export function boxStyle(box: Box): {
  position: "absolute";
  left: number;
  top: number;
  width: number;
  height: number;
  right: "auto";
  bottom: "auto";
} {
  return {
    position: "absolute",
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    right: "auto",
    bottom: "auto",
  };
}

export function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Prefer the video clock; WebM often reports Infinity, so fall back to the packed timeline. */
export function mediaDuration(videoDuration: number, timelineSec: number): number {
  if (Number.isFinite(videoDuration) && videoDuration > 0) return videoDuration;
  if (Number.isFinite(timelineSec) && timelineSec > 0) return timelineSec;
  return 0;
}

/** Never clamp a skip to 0 just because duration is still unknown. */
export function clampSeek(next: number, cap: number): number {
  if (!Number.isFinite(next) || next < 0) return 0;
  if (Number.isFinite(cap) && cap > 0) return Math.min(cap, next);
  return next;
}

export function seekBarPct(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(time) || time <= 0) return 0;
  return Math.min(100, Math.max(0, (time / duration) * 100));
}

/** Played fill vs hover ghost. Hover never moves the fill; drag does. */
export function seekBarLayers(opts: {
  played: number;
  hover: number | null;
  duration: number;
  dragging: boolean;
}): { fillPct: number; hoverPct: number | null; tipPct: number | null; tipTime: number | null } {
  const fillAt = (t: number) => seekBarPct(t, opts.duration);
  const playedPct = fillAt(opts.played);
  if (opts.hover == null) {
    return { fillPct: playedPct, hoverPct: null, tipPct: null, tipTime: null };
  }
  const hoverPct = fillAt(opts.hover);
  if (opts.dragging) {
    return { fillPct: hoverPct, hoverPct: null, tipPct: hoverPct, tipTime: opts.hover };
  }
  return { fillPct: playedPct, hoverPct: hoverPct, tipPct: hoverPct, tipTime: opts.hover };
}

/** How far from 0 the buffer is contiguous. */
export function bufferedPct(
  ranges: { length: number; start: (i: number) => number; end: (i: number) => number } | null,
  duration: number,
): number {
  if (!ranges || ranges.length < 1 || !(duration > 0)) return 0;
  let end = 0;
  try {
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= end + 0.35) end = Math.max(end, ranges.end(i));
    }
  } catch {
    return 0;
  }
  return seekBarPct(end, duration);
}

export function tipLeft(pct: number): string {
  const n = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return `clamp(1.4rem, ${n}%, calc(100% - 1.4rem))`;
}

export function assignMediaTime(video: { currentTime: number; fastSeek?: (t: number) => void }, t: number) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  try {
    video.currentTime = t;
  } catch {
    try {
      if (typeof video.fastSeek === "function") video.fastSeek(t);
    } catch {
      /* ignore */
    }
  }
}

/** Hover previews a time. Only a held drag or a click commits it to the video. */
export function seekBarIntent(
  phase: "move" | "down" | "up" | "leave",
  dragging: boolean,
  buttons = 0,
): "hover" | "scrub" | "commit" | "clear" {
  if (phase === "down") return "scrub";
  if (phase === "up") return dragging ? "commit" : "clear";
  if (phase === "leave") return dragging ? "scrub" : "clear";
  if (dragging || buttons === 1) return "scrub";
  return "hover";
}

export function keepPlayingAfterSeek(
  video: { paused: boolean; play: () => Promise<unknown> },
  wasPlaying: boolean,
) {
  if (wasPlaying && video.paused) return video.play();
  return undefined;
}

/**
 * Hold the board on the requested time only while the seek is in flight.
 * After SEEK_HOLD_MS, or once currentTime is close / actually playing, follow media.
 * Never retry assignMediaTime from the clock loop — that retriggers seeking forever.
 */
export const SEEK_HOLD_MS = 700;

export function followMediaClock(opts: {
  mediaSec: number;
  targetSec: number | null;
  seeking: boolean;
  paused: boolean;
  lockAgeMs: number;
}): { time: number; clearLock: boolean } {
  const media = Number.isFinite(opts.mediaSec) && opts.mediaSec >= 0 ? opts.mediaSec : 0;
  if (opts.targetSec == null) return { time: media, clearLock: true };
  const close = Number.isFinite(opts.mediaSec) && Math.abs(opts.mediaSec - opts.targetSec) <= 0.75;
  const playingAlong = !opts.paused && !opts.seeking && media > 0;
  if (close || playingAlong || opts.lockAgeMs >= SEEK_HOLD_MS) {
    return { time: media > 0 ? media : opts.targetSec, clearLock: true };
  }
  return { time: opts.targetSec, clearLock: false };
}

/** Spinner only while the video is actually waiting. Never for hover, seek, or first paint. */
export function showSeekSpinner(opts: {
  ready: boolean;
  buffering: boolean;
  playing: boolean;
  previewing: boolean;
  seeking?: boolean;
}): boolean {
  if (opts.previewing || opts.seeking) return false;
  return Boolean(opts.buffering && opts.playing);
}

export function playGlyph(playing: boolean, ended: boolean): "play" | "pause" {
  return playing && !ended ? "pause" : "play";
}

/** Map a pointer on the seek hit to a time. `duration` is the bar's max. */
export function timeFromClientX(
  clientX: number,
  rect: { left: number; width: number },
  duration: number,
): number {
  if (!(rect.width > 0) || !(duration > 0) || !Number.isFinite(clientX)) return 0;
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return pct * duration;
}

export function formatSpeed(n: number) {
  if (!Number.isFinite(n)) return "1";
  return Number.isInteger(n) ? String(n) : String(n);
}

export function rectsOverlap(a: Box, b: Box, gap = 0) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

/** Place a max 16:9 board. The lantern is a small circle on the lower-right of the board.
 *  When the top and bottom bars are open, the board sits in the gap between them.
 */
export function layoutSlate(
  stage: StageSize,
  opts: { camOff?: boolean; pocket?: boolean; pip?: boolean; filmOn?: boolean; chrome?: boolean } = {},
): { board: Box; lantern: Box; sideStrip: boolean } {
  const inset = 8;
  const pocket = opts.pocket ?? stage.width < 640;
  const camOff = Boolean(opts.camOff);
  const pip = opts.pip !== false;
  const top = opts.chrome ? 64 : 0;
  const rail = opts.chrome ? 68 : 0;
  // On a pocket stage the film is a band above the rail, not a side overlay.
  const filmDock = Boolean(opts.filmOn && pocket);
  const filmH = filmDock ? 56 : 0;
  const railSlot = filmDock && !opts.chrome ? 58 : rail;
  const bottom = railSlot + filmH;
  const availW = Math.max(160, stage.width - inset * 2);
  const availH = Math.max(120, stage.height - inset * 2 - top - bottom);
  const fit = fit16x9(availW, availH);
  const board: Box = {
    x: inset + (availW - fit.w) / 2,
    y: inset + top + (availH - fit.h) / 2,
    w: fit.w,
    h: fit.h,
  };

  const filmW = opts.filmOn && !pocket ? 118 : 0;

  const pinLantern = (s: number): Box => ({
    x: board.x + board.w - s - (pocket ? 10 : 18) - filmW,
    y: board.y + board.h - s - (pocket ? 10 : 16),
    w: s,
    h: s,
  });

  if (camOff) {
    return { board, lantern: { x: 0, y: 0, w: 1, h: 1 }, sideStrip: Boolean(opts.filmOn) };
  }

  if (!pip && !pocket) {
    const s = Math.min(188, Math.max(140, Math.round(stage.width * 0.13)));
    return { board, lantern: pinLantern(s), sideStrip: Boolean(opts.filmOn) };
  }

  const s = pocket
    ? Math.min(112, Math.max(88, Math.round(stage.width * 0.24)))
    : Math.min(168, Math.max(120, Math.round(stage.width * 0.11)));
  return { board, lantern: pinLantern(s), sideStrip: Boolean(opts.filmOn) };
}

/** Keep a dragged lantern on the same part of the board when the stage or the bars change. */
export function repositionLantern(
  prevBoard: Box,
  prevBox: Box,
  nextBoard: Box,
  stage: StageSize,
  round: boolean,
): Box {
  const rx = prevBoard.w > 1 ? (prevBox.x - prevBoard.x) / prevBoard.w : 0.7;
  const ry = prevBoard.h > 1 ? (prevBox.y - prevBoard.y) / prevBoard.h : 0.7;
  const rs = prevBoard.w > 1 ? prevBox.w / prevBoard.w : 0.12;
  const s = Math.min(nextBoard.w * 0.42, Math.max(round ? 72 : 96, rs * nextBoard.w));
  const h = round
    ? s
    : Math.min(nextBoard.h * 0.8, Math.max(96, (prevBox.h / Math.max(1, prevBoard.h)) * nextBoard.h));
  return clampBox(
    { x: nextBoard.x + rx * nextBoard.w, y: nextBoard.y + ry * nextBoard.h, w: s, h },
    stage,
    round,
  );
}

export function defaultPip(stage: StageSize, board?: { x: number; y: number; w: number; h: number }): Box {
  const s = Math.min(168, Math.max(112, Math.round(stage.width * 0.11)));
  const gutter = board ? stage.width - (board.x + board.w) : 0;
  if (board && gutter >= s + 20) {
    return {
      x: Math.min(stage.width - s - 12, board.x + board.w + 10),
      y: Math.max(12, board.y + board.h - s - 8),
      w: s,
      h: s,
    };
  }
  return {
    x: Math.max(12, stage.width - s - 16),
    y: Math.max(12, stage.height - s - 16),
    w: s,
    h: s,
  };
}

export function sideBox(stage: StageSize): Box {
  if (stage.width < 640) {
    const s = Math.min(120, Math.max(96, Math.round(stage.width * 0.28)));
    return { x: stage.width - s - 8, y: stage.height - s - 8, w: s, h: s };
  }
  const w = Math.min(stage.width * 0.32, 420);
  return { x: stage.width - w - 8, y: 8, w, h: stage.height - 16 };
}

export function clampBox(b: Box, stage: StageSize, round: boolean): Box {
  const min = round ? 72 : 168;
  const w = Math.min(stage.width - 16, Math.max(min, b.w));
  const h = round ? w : Math.min(stage.height - 16, Math.max(96, b.h));
  return {
    w,
    h,
    x: Math.min(stage.width - w - 8, Math.max(8, b.x)),
    y: Math.min(stage.height - h - 8, Math.max(8, b.y)),
  };
}

export function nextPipSize(currentW: number) {
  return PIP_SIZES.find((s) => s > currentW + 4) ?? PIP_SIZES[0]!;
}

export function cycleSpeed(current: number) {
  const idx = PLAYER_SPEEDS.indexOf(current as (typeof PLAYER_SPEEDS)[number]);
  const i = idx < 0 ? PLAYER_SPEEDS.indexOf(1) : idx;
  return PLAYER_SPEEDS[(i + 1) % PLAYER_SPEEDS.length] ?? 1;
}

export function stepSpeed(current: number, dir: -1 | 1) {
  const idx = PLAYER_SPEEDS.indexOf(current as (typeof PLAYER_SPEEDS)[number]);
  const i = idx < 0 ? PLAYER_SPEEDS.indexOf(1) : idx;
  return PLAYER_SPEEDS[Math.max(0, Math.min(PLAYER_SPEEDS.length - 1, i + dir))] ?? current;
}

export function jumpSlideTime(
  tl: {
    switches: { t: number; uid: string }[];
    slides: { uid: string; t: number }[];
    durationMs: number;
  },
  uid: string,
) {
  let bestT = -1;
  let bestDur = 0;
  for (let i = 0; i < tl.switches.length; i++) {
    const s = tl.switches[i]!;
    if (s.uid !== uid) continue;
    const next = tl.switches[i + 1];
    const dur = (next ? next.t : tl.durationMs) - s.t;
    if (dur > bestDur) {
      bestDur = dur;
      bestT = s.t;
    }
  }
  if (bestT >= 0) return bestT / 1000 + 0.08;
  const added = tl.slides.find((s) => s.uid === uid);
  return added ? added.t / 1000 + 0.08 : null;
}

export function rebatePins(
  slides: { uid: string; t: number }[],
  bookmarks: { seconds: number }[],
) {
  const pins = new Set<string>();
  if (!slides.length) return pins;
  const ordered = [...slides].sort((a, b) => a.t - b.t);
  for (const b of bookmarks) {
    const ms = Math.max(0, b.seconds) * 1000;
    let uid = ordered[0]!.uid;
    for (const s of ordered) {
      if (s.t <= ms) uid = s.uid;
      else break;
    }
    pins.add(uid);
  }
  return pins;
}

export type PlayerHotkey =
  | { type: "togglePlay"; preventDefault: true }
  | { type: "seekBy"; seconds: number }
  | { type: "seekFraction"; frac: number }
  | { type: "fullscreen" }
  | { type: "toggleCam" }
  | { type: "toggleMute" }
  | { type: "speed"; dir: -1 | 1 }
  | { type: "later" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "help" }
  | { type: "slidePrev" }
  | { type: "slideNext" }
  | { type: "toggleStrip" }
  | { type: "sleep" }
  | { type: "skipIntro" };

export function isTypingTarget(target: { tagName?: string; isContentEditable?: boolean; type?: string } | null) {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    Boolean(target.isContentEditable) ||
    (tag === "INPUT" && target.type !== "range")
  );
}

export function playerHotkey(
  e: {
    key: string;
    code: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    defaultPrevented?: boolean;
  },
  target: { tagName?: string; isContentEditable?: boolean; type?: string } | null,
  opts: { hasNext?: boolean; hasPrev?: boolean } = {},
): PlayerHotkey | null {
  if (e.defaultPrevented) return null;
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (isTypingTarget(target)) return null;
  const key = e.key.toLowerCase();
  if (e.shiftKey && (e.code === "ArrowRight" || key === ".")) return { type: "slideNext" };
  if (e.shiftKey && (e.code === "ArrowLeft" || key === ",")) return { type: "slidePrev" };
  if (key === ",") return { type: "slidePrev" };
  if (key === ".") return { type: "slideNext" };
  if (key === "s") return { type: "toggleStrip" };
  if (key === "t") return { type: "sleep" };
  if (key === "i") return { type: "skipIntro" };
  if (e.code === "Space" || key === "k") return { type: "togglePlay", preventDefault: true };
  if (e.code === "ArrowRight" || key === "l") return { type: "seekBy", seconds: 10 };
  if (e.code === "ArrowLeft" || key === "j") return { type: "seekBy", seconds: -10 };
  if (key === "f") return { type: "fullscreen" };
  if (key === "c") return { type: "toggleCam" };
  if (key === "m") return { type: "toggleMute" };
  if (e.key === "[") return { type: "speed", dir: -1 };
  if (e.key === "]") return { type: "speed", dir: 1 };
  if (key === "b") return { type: "later" };
  if (key === "n" && opts.hasNext) return { type: "next" };
  if (key === "p" && opts.hasPrev) return { type: "prev" };
  if (e.key >= "0" && e.key <= "9") return { type: "seekFraction", frac: Number(e.key) / 10 };
  if (e.key === "?" || (e.shiftKey && key === "/")) return { type: "help" };
  return null;
}

export function nextSlideUid(
  switches: { t: number; uid: string }[],
  currentUid: string,
  dir: -1 | 1,
): string | null {
  const uids: string[] = [];
  for (const s of switches) {
    if (uids[uids.length - 1] !== s.uid) uids.push(s.uid);
  }
  const i = uids.indexOf(currentUid);
  if (i < 0) return uids[0] ?? null;
  return uids[i + dir] ?? null;
}

export const SLEEP_MINUTES = 15;

/** A saved place past the end of a shorter file starts over. An unknown length is kept. */
export function resumeTime(saved: number, duration: number): number {
  if (!Number.isFinite(saved) || saved <= 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return saved;
  if (saved >= duration - 0.5) return 0;
  return saved;
}

/** A loop needs at least one second and must sit inside the lecture. */
export function abLoop(start: number, end: number, duration: number): { start: number; end: number } | null {
  if (![start, end, duration].every((n) => Number.isFinite(n)) || duration <= 0) return null;
  const a = Math.max(0, Math.min(start, end));
  const b = Math.min(duration, Math.max(start, end));
  if (b - a < 1) return null;
  return { start: a, end: b };
}

/** When playback reaches the end of a loop, jump back to the start. */
export function loopRestart(time: number, loop: { start: number; end: number } | null): number | null {
  if (!loop || !Number.isFinite(time)) return null;
  return time >= loop.end ? loop.start : null;
}

/** Milliseconds left on a sleep timer. A bad or finished timer is zero. */
export function sleepLeftMs(startedAt: number, now: number, minutes: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now) || !Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.max(0, Math.floor(startedAt + minutes * 60_000 - now));
}

/** Backoff for a dropped segment. Caps at 8 seconds. */
export function retryDelayMs(attempt: number): number {
  const n = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return Math.min(8000, 250 * 2 ** Math.min(n, 8));
}

/** Holding the lecture plays at 2x. Letting go returns to the chosen speed. */
export function holdRate(holding: boolean, base: number): number {
  const chosen = Number.isFinite(base) && base > 0 ? base : 1;
  return holding ? 2 : chosen;
}

/** Seconds jumped over while skipping silence. A backward or empty jump adds nothing. */
export function addSilenceSaved(saved: number, from: number, to: number): number {
  const base = Number.isFinite(saved) && saved > 0 ? saved : 0;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return base;
  return base + (to - from);
}
