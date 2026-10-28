import { nowIso } from "./dates.ts";
import type { PlanTask } from "./types.ts";

export const FOCUS_KEY = "inkboard.planner.focus.v1";
export const SCRATCH_KEY = "inkboard.planner.scratch.v1";
export const SUMMARY_KEY = "inkboard.planner.focus-summary.v1";

export type FocusRun = {
  planId: string;
  queue: string[];
  index: number;
  startedAt: string;
  notes: Record<string, string>;
};

export type SessionSummary = {
  startedAt: string;
  endedAt: string;
  tasksDone: number;
  queue: number;
  minutes: number;
};

function canStore(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readJson<T>(key: string, fallback: T): T {
  if (!canStore()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canStore()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function readFocusRun(): FocusRun | null {
  const run = readJson<FocusRun | null>(FOCUS_KEY, null);
  if (!run || !Array.isArray(run.queue)) return null;
  return run;
}

export function startFocusRun(planId: string, tasks: PlanTask[]): FocusRun {
  const queue = tasks.filter((t) => t.status === "pending").map((t) => t.id);
  const run: FocusRun = { planId, queue, index: 0, startedAt: nowIso(), notes: {} };
  writeJson(FOCUS_KEY, run);
  return run;
}

export function advanceFocusRun(): FocusRun | null {
  const run = readFocusRun();
  if (!run) return null;
  const next = { ...run, index: Math.min(run.queue.length, run.index + 1) };
  writeJson(FOCUS_KEY, next);
  return next;
}

export function clearFocusRun() {
  if (!canStore()) return;
  try {
    localStorage.removeItem(FOCUS_KEY);
  } catch {
    /* ignore */
  }
}

export const FOCUS_WORK_SEC = 25 * 60;
export const FOCUS_BREAK_SEC = 5 * 60;

/** A 25-minute block, then a 5-minute break. Times past both are done. */
export function focusClock(
  elapsedSec: number,
  workSec = FOCUS_WORK_SEC,
  breakSec = FOCUS_BREAK_SEC,
): { phase: "work" | "break" | "done"; leftSec: number } {
  const elapsed = Number.isFinite(elapsedSec) ? Math.max(0, Math.floor(elapsedSec)) : 0;
  const work = Math.max(60, Math.floor(workSec));
  const rest = Math.max(60, Math.floor(breakSec));
  if (elapsed < work) return { phase: "work", leftSec: work - elapsed };
  if (elapsed < work + rest) return { phase: "break", leftSec: work + rest - elapsed };
  return { phase: "done", leftSec: 0 };
}

export const BREAK_EVERY_MS = 40 * 60_000;

/** True once accumulated play time since the last break hits forty minutes. */
export function shouldNudgeBreak(playedMs: number, alreadyShown = false): boolean {
  return !alreadyShown && playedMs >= BREAK_EVERY_MS;
}

export function focusProgress(run: FocusRun | null = readFocusRun()): { index: number; total: number; percent: number } {
  if (!run?.queue.length) return { index: 0, total: 0, percent: 0 };
  return {
    index: Math.min(run.index, run.queue.length),
    total: run.queue.length,
    percent: Math.round((Math.min(run.index, run.queue.length) / run.queue.length) * 100),
  };
}

export function endFocusRun(minutes = 0): SessionSummary | null {
  const run = readFocusRun();
  if (!run) return null;
  const summary: SessionSummary = {
    startedAt: run.startedAt,
    endedAt: nowIso(),
    tasksDone: Math.min(run.index, run.queue.length),
    queue: run.queue.length,
    minutes,
  };
  writeJson(SUMMARY_KEY, summary);
  clearFocusRun();
  return summary;
}

export function readSessionSummary(): SessionSummary | null {
  return readJson<SessionSummary | null>(SUMMARY_KEY, null);
}

export function clearSessionSummary() {
  if (!canStore()) return;
  try {
    localStorage.removeItem(SUMMARY_KEY);
  } catch {
    /* ignore */
  }
}

export function readScratch(): Record<string, string> {
  const map = readJson<Record<string, string>>(SCRATCH_KEY, {});
  return map && typeof map === "object" ? map : {};
}

export function writeScratch(lessonOrTaskId: string, notes: string) {
  const map = readScratch();
  map[lessonOrTaskId] = notes;
  writeJson(SCRATCH_KEY, map);
}

export function scratchFor(id: string): string {
  return readScratch()[id] ?? "";
}

export function attachScratchToRun(taskId: string, notes: string): FocusRun | null {
  const run = readFocusRun();
  if (!run) {
    writeScratch(taskId, notes);
    return null;
  }
  const next = { ...run, notes: { ...run.notes, [taskId]: notes } };
  writeJson(FOCUS_KEY, next);
  writeScratch(taskId, notes);
  return next;
}

export function currentFocusTask(tasks: PlanTask[], run: FocusRun | null = readFocusRun()): PlanTask | null {
  if (!run) return null;
  const id = run.queue[run.index];
  if (!id) return null;
  return tasks.find((t) => t.id === id) ?? null;
}

export function nextFocusTask(tasks: PlanTask[], run: FocusRun | null = readFocusRun()): PlanTask | null {
  if (!run) return null;
  const id = run.queue[run.index + 1];
  if (!id) return null;
  return tasks.find((t) => t.id === id) ?? null;
}
