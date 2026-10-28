import {
  EMPTY_STATE,
  EPOCH_ISO,
  PLANNER_KEY,
  asLessons,
  fillPrefs,
  fillTask,
  type PlanTask,
  type PlannerState,
  type StudyDayLog,
  type StudyPlan,
} from "../types.ts";
import { cacheTodayPlan } from "../offline.ts";
import { nowIso, todayKey } from "../dates.ts";
import { purgeTombstones } from "../merge.ts";
import { applyUndoEntry, clearUndo, popUndo, pushUndo, type UndoEntry } from "../undo.ts";
import { diffDirtyFrom, markDirty } from "../dirty.ts";
import { readWatchLogs, subscribeWatch } from "../watch-store.ts";
import { activePlanOf } from "./queries.ts";

export const EMPTY_SNAPSHOT: PlannerState = Object.freeze({
  version: 3,
  plans: [],
  activePlanId: null,
  days: [],
  freezeWeeks: [],
  watchLogs: [],
}) as PlannerState;

let cachedRaw: string | null | undefined;
let cachedState: PlannerState = emptyState();
let quotaMessage: string | null = null;
const listeners = new Set<() => void>();

function emptyState(): PlannerState {
  return { version: 3, plans: [], activePlanId: null, days: [], freezeWeeks: [], watchLogs: [] };
}

function canStore(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function isPlan(v: unknown): v is StudyPlan {
  if (!v || typeof v !== "object") return false;
  const p = v as StudyPlan;
  return typeof p.id === "string" && Array.isArray(p.tasks) && Boolean(p.prefs) && typeof p.examId === "string";
}

function normalizeTask(raw: Partial<PlanTask> & { id?: string }): PlanTask | null {
  if (!raw || typeof raw.id !== "string") return null;
  return fillTask({
    ...raw,
    id: raw.id,
    title: raw.title || "Class",
    deletedAt: raw.deletedAt ?? null,
  });
}

function normalizePlan(p: StudyPlan): StudyPlan {
  return {
    ...p,
    prefs: fillPrefs(p.prefs),
    updatedAt: p.updatedAt || p.createdAt || EPOCH_ISO,
    deletedAt: p.deletedAt ?? null,
    courses: Array.isArray(p.courses)
      ? p.courses.map((c) => ({
          ...c,
          lessons: asLessons(c.lessons),
        }))
      : [],
    tasks: purgeTombstones(p.tasks.map(normalizeTask).filter((t): t is PlanTask => Boolean(t))),
  };
}

function normalizeDay(d: Partial<StudyDayLog>): StudyDayLog | null {
  if (!d || typeof d.date !== "string") return null;
  return {
    date: d.date,
    minutesStudied: Number(d.minutesStudied) || 0,
    tasksDone: Number(d.tasksDone) || 0,
    updatedAt: d.updatedAt || EPOCH_ISO,
  };
}

export function stampPlan(plan: StudyPlan, at = nowIso()): StudyPlan {
  return { ...plan, updatedAt: at };
}

function emit() {
  for (const cb of listeners) cb();
}

export function plannerQuotaError(): string | null {
  return quotaMessage;
}

function parseStored(raw: string | null): PlannerState {
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as Partial<PlannerState>;
    const plans = Array.isArray(parsed.plans) ? parsed.plans.filter(isPlan).map(normalizePlan) : [];
    const days = Array.isArray(parsed.days)
      ? parsed.days.map(normalizeDay).filter((d): d is StudyDayLog => Boolean(d))
      : [];
    const freezeWeeks = Array.isArray(parsed.freezeWeeks)
      ? parsed.freezeWeeks.filter((x): x is string => typeof x === "string")
      : [];
    const visible = plans.filter((p) => !p.deletedAt);
    const activePlanId =
      typeof parsed.activePlanId === "string" && visible.some((p) => p.id === parsed.activePlanId)
        ? parsed.activePlanId
        : visible.find((p) => p.active)?.id ?? visible[0]?.id ?? null;
    return { version: 3, plans, activePlanId, days, freezeWeeks, watchLogs: [] };
  } catch {
    return emptyState();
  }
}

export function getServerPlanner(): PlannerState {
  return EMPTY_SNAPSHOT;
}

export function readPlanner(): PlannerState {
  const logs = readWatchLogs();
  if (!canStore()) {
    if (cachedState.watchLogs !== logs) cachedState = { ...cachedState, watchLogs: logs };
    return cachedState;
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PLANNER_KEY);
  } catch {
    raw = cachedRaw ?? null;
  }
  // A quota-throwing or swapped store often returns null on getItem.
  // Keep the last good copy so we never present a wiped plan as truth.
  if (raw == null && cachedRaw) raw = cachedRaw;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseStored(raw);
  }
  if (cachedState.watchLogs !== logs) cachedState = { ...cachedState, watchLogs: logs };
  return cachedState;
}

export function writePlanner(state: PlannerState): boolean {
  const persistable: PlannerState = { ...state, version: 3, watchLogs: [] };
  const raw = JSON.stringify(persistable);
  if (raw === cachedRaw) {
    cachedState = { ...state, version: 3, watchLogs: readWatchLogs() };
    return true;
  }
  if (!canStore()) {
    quotaMessage = "This device is out of storage space. Export a backup, then free some room.";
    emit();
    return false;
  }
  try {
    localStorage.setItem(PLANNER_KEY, raw);
    cachedRaw = raw;
    cachedState = { ...state, version: 3, watchLogs: readWatchLogs() };
    quotaMessage = null;
  } catch {
    quotaMessage = "This device is out of storage space. Export a backup, then free some room.";
    emit();
    return false;
  }
  emit();
  const plan = activePlanOf(cachedState);
  cacheTodayPlan(plan ?? null, todayKey());
  return true;
}

/** Tell open planner screens that localStorage was rewritten from outside (account sync merge). */
export function notifyPlannerChanged() {
  emit();
}

export function subscribePlanner(cb: () => void) {
  listeners.add(cb);
  const unwatch = subscribeWatch(cb);
  return () => {
    listeners.delete(cb);
    unwatch();
  };
}

export function patchPlanner(fn: (state: PlannerState) => PlannerState): PlannerState {
  const prev = readPlanner();
  const next = fn(prev);
  if (next === prev) return prev;
  if (!writePlanner(next)) return readPlanner();
  markDirty(diffDirtyFrom(prev, next));
  return readPlanner();
}

export function captureUndo(label: string, pick: (s: PlannerState) => Omit<UndoEntry, "label">) {
  const s = readPlanner();
  pushUndo({ label, ...pick(s) });
}

export function snapshotUndo() {
  const s = readPlanner();
  const plan = activePlanOf(s);
  pushUndo({
    label: "snapshot",
    plans: s.plans,
    tasks: plan?.tasks,
    days: s.days,
    activePlanId: s.activePlanId,
  });
}

export function undoLast(): boolean {
  const entry = popUndo();
  if (!entry) return false;
  patchPlanner((s) => applyUndoEntry(s, entry));
  return true;
}

export function resetCoreCache() {
  cachedRaw = undefined;
  cachedState = emptyState();
  quotaMessage = null;
  clearUndo();
}

export { EMPTY_STATE };
