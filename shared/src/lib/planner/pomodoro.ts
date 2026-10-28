import { nowIso, todayKey } from "./dates.ts";
import { uid } from "./ids.ts";
import { addSession, type StudySession } from "./sessions.ts";
import { addWatchMinutes } from "./storage/days.ts";
import { subjectIdOf, type SubjectId } from "./subjects.ts";
import type { PlanTask } from "./types.ts";

/**
 * Pomodoro that knows what you are studying.
 * A block is bound to a plan task (lecture / revision / custom) or just a category, so every finished
 * work phase lands in the study log under the right subject, course and lesson — the analytics,
 * streak and badges all see it without a manual "log study".
 */

export const POMODORO_KEY = "inkboard.planner.pomodoro.v1";

export type PomodoroPreset = { id: "classic" | "deep" | "sprint" | "custom"; label: string; workMin: number; breakMin: number; longBreakMin: number; rounds: number };

export const POMODORO_PRESETS: PomodoroPreset[] = [
  { id: "classic", label: "25 · 5", workMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4 },
  { id: "deep", label: "50 · 10", workMin: 50, breakMin: 10, longBreakMin: 20, rounds: 3 },
  { id: "sprint", label: "15 · 3", workMin: 15, breakMin: 3, longBreakMin: 10, rounds: 4 },
];

export type PomodoroPhase = "work" | "break" | "long";

export type PomodoroBind = {
  taskId: string | null;
  lessonId: string | null;
  courseId: string | null;
  title: string;
  subject: SubjectId;
  planId: string | null;
};

export type PomodoroState = {
  status: "running" | "paused";
  phase: PomodoroPhase;
  /** 1-based work round within the current cycle. */
  round: number;
  preset: PomodoroPreset;
  bind: PomodoroBind;
  /** Epoch ms when the current phase (re)started; null while paused. */
  phaseStartedMs: number | null;
  /** Seconds already spent in this phase before the latest resume. */
  phaseElapsedSec: number;
  /** Work seconds finished and logged since start. */
  loggedWorkSec: number;
  startedAt: string;
};

export type PomodoroClock = { phase: PomodoroPhase; leftSec: number; elapsedSec: number; totalSec: number; pct: number; over: boolean };

const listeners = new Set<() => void>();
let cache: PomodoroState | null | undefined;

function canStore(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function emit() {
  for (const cb of listeners) cb();
}

export function subscribePomodoro(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getServerPomodoro(): PomodoroState | null {
  return null;
}

export function readPomodoro(): PomodoroState | null {
  if (cache !== undefined) return cache;
  if (!canStore()) {
    cache = null;
    return null;
  }
  try {
    const raw = localStorage.getItem(POMODORO_KEY);
    const parsed = raw ? (JSON.parse(raw) as PomodoroState) : null;
    cache = parsed?.preset && parsed.bind && (parsed.status === "running" || parsed.status === "paused") ? parsed : null;
  } catch {
    cache = null;
  }
  return cache;
}

export function writePomodoro(next: PomodoroState | null) {
  cache = next;
  if (canStore()) {
    try {
      if (next) localStorage.setItem(POMODORO_KEY, JSON.stringify(next));
      else localStorage.removeItem(POMODORO_KEY);
    } catch {
      /* quota */
    }
  }
  emit();
  return next;
}

export function resetPomodoro() {
  cache = undefined;
  listeners.clear();
}

/** Bind straight from a plan task — lecture, revision, DPP or custom. */
export function bindFromTask(task: PlanTask, planId: string | null = null): PomodoroBind {
  return {
    taskId: task.id,
    lessonId: task.lessonId,
    courseId: task.courseId,
    title: task.title,
    subject: subjectIdOf(task.subject || task.title),
    planId,
  };
}

/** Bind to just a category when there is no task to point at. */
export function bindFromSubject(subject: SubjectId, title = ""): PomodoroBind {
  return { taskId: null, lessonId: null, courseId: null, title: title || subjectTitle(subject), subject, planId: null };
}

export function subjectTitle(subject: SubjectId): string {
  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

export function phaseSeconds(preset: PomodoroPreset, phase: PomodoroPhase): number {
  const min = phase === "work" ? preset.workMin : phase === "break" ? preset.breakMin : preset.longBreakMin;
  return Math.max(60, Math.round(min * 60));
}

export function customPreset(workMin: number, breakMin: number, longBreakMin = breakMin * 3, rounds = 4): PomodoroPreset {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
  return { id: "custom", label: `${clamp(workMin, 1, 180)} · ${clamp(breakMin, 1, 60)}`, workMin: clamp(workMin, 1, 180), breakMin: clamp(breakMin, 1, 60), longBreakMin: clamp(longBreakMin, 1, 90), rounds: clamp(rounds, 1, 12) };
}

export function startPomodoro(bind: PomodoroBind, preset: PomodoroPreset = POMODORO_PRESETS[0]!, nowMs = Date.now()): PomodoroState {
  return writePomodoro({
    status: "running",
    phase: "work",
    round: 1,
    preset,
    bind,
    phaseStartedMs: nowMs,
    phaseElapsedSec: 0,
    loggedWorkSec: 0,
    startedAt: nowIso(new Date(nowMs)),
  })!;
}

/** Seconds spent in the current phase as of `nowMs` (pure). */
export function phaseElapsed(state: PomodoroState, nowMs = Date.now()): number {
  const live = state.status === "running" && state.phaseStartedMs != null ? Math.max(0, (nowMs - state.phaseStartedMs) / 1000) : 0;
  return Math.floor(state.phaseElapsedSec + live);
}

export function pomodoroClock(state: PomodoroState, nowMs = Date.now()): PomodoroClock {
  const totalSec = phaseSeconds(state.preset, state.phase);
  const elapsedSec = phaseElapsed(state, nowMs);
  const leftSec = Math.max(0, totalSec - elapsedSec);
  return { phase: state.phase, leftSec, elapsedSec, totalSec, pct: Math.min(100, Math.round((elapsedSec / totalSec) * 100)), over: elapsedSec >= totalSec };
}

export function pausePomodoro(nowMs = Date.now()): PomodoroState | null {
  const cur = readPomodoro();
  if (cur?.status !== "running") return cur;
  return writePomodoro({ ...cur, status: "paused", phaseElapsedSec: phaseElapsed(cur, nowMs), phaseStartedMs: null });
}

export function resumePomodoro(nowMs = Date.now()): PomodoroState | null {
  const cur = readPomodoro();
  if (cur?.status !== "paused") return cur;
  return writePomodoro({ ...cur, status: "running", phaseStartedMs: nowMs });
}

/** Which phase follows a finished one (pure). Every `rounds`-th work block earns the long break. */
export function nextPhase(state: Pick<PomodoroState, "phase" | "round" | "preset">): { phase: PomodoroPhase; round: number } {
  if (state.phase === "work") {
    return { phase: state.round % state.preset.rounds === 0 ? "long" : "break", round: state.round };
  }
  return { phase: "work", round: state.round + 1 };
}

function buildSession(bind: PomodoroBind, seconds: number, endMs: number): StudySession {
  const durationMin = Math.max(1, Math.round(seconds / 60));
  const start = new Date(endMs - seconds * 1000);
  const at = nowIso(new Date(endMs));
  return {
    id: uid("ses"),
    date: todayKey(start),
    startIso: start.toISOString(),
    durationMin,
    subject: bind.subject,
    courseId: bind.courseId,
    taskId: bind.taskId,
    lessonId: bind.lessonId,
    notes: bind.title ? `Focus · ${bind.title}` : "Focus block",
    source: "focus",
    completed: true,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

/** Minimum work time worth writing to the log — stops a mis-click from becoming a session. */
export const POMODORO_MIN_LOG_SEC = 60;

/**
 * Finish the current phase (either because the clock ran out or the user skipped) and move on.
 * A finished work phase is written to the study log under the bound subject/lesson.
 */
export function advancePomodoro(nowMs = Date.now()): { state: PomodoroState | null; logged: StudySession | null } {
  const cur = readPomodoro();
  if (!cur) return { state: null, logged: null };
  let logged: StudySession | null = null;
  let loggedWorkSec = cur.loggedWorkSec;
  if (cur.phase === "work") {
    const seconds = Math.min(phaseElapsed(cur, nowMs), phaseSeconds(cur.preset, "work"));
    if (seconds >= POMODORO_MIN_LOG_SEC) {
      logged = buildSession(cur.bind, seconds, nowMs);
      addSession(logged);
      addWatchMinutes(logged.date, logged.durationMin);
      loggedWorkSec += seconds;
    }
  }
  const next = nextPhase(cur);
  const state = writePomodoro({ ...cur, ...next, status: "running", phaseStartedMs: nowMs, phaseElapsedSec: 0, loggedWorkSec });
  return { state, logged };
}

/** Stop entirely. Unfinished work time still counts if it passed the minimum. */
export function stopPomodoro(nowMs = Date.now()): { logged: StudySession | null; totalWorkSec: number } {
  const cur = readPomodoro();
  if (!cur) return { logged: null, totalWorkSec: 0 };
  let logged: StudySession | null = null;
  let total = cur.loggedWorkSec;
  if (cur.phase === "work") {
    const seconds = Math.min(phaseElapsed(cur, nowMs), phaseSeconds(cur.preset, "work"));
    if (seconds >= POMODORO_MIN_LOG_SEC) {
      logged = buildSession(cur.bind, seconds, nowMs);
      addSession(logged);
      addWatchMinutes(logged.date, logged.durationMin);
      total += seconds;
    }
  }
  writePomodoro(null);
  return { logged, totalWorkSec: total };
}

/** Re-point a running block at a different task without losing the clock. */
export function rebindPomodoro(bind: PomodoroBind): PomodoroState | null {
  const cur = readPomodoro();
  if (!cur) return null;
  return writePomodoro({ ...cur, bind });
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function phaseLabel(phase: PomodoroPhase): string {
  return phase === "work" ? "Focus" : phase === "break" ? "Short break" : "Long break";
}

/** One line for a chip or the document title: `12:34 · Focus · Algebra`. */
export function pomodoroLine(state: PomodoroState, nowMs = Date.now()): string {
  const clock = pomodoroClock(state, nowMs);
  const what = state.phase === "work" ? state.bind.title || subjectTitle(state.bind.subject) : phaseLabel(state.phase);
  return `${formatClock(clock.leftSec)} · ${state.status === "paused" ? "Paused" : what}`;
}
