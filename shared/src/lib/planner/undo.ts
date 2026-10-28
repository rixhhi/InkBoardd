import type { PlanTask, PlannerState, StudyDayLog, StudyPlan, WatchLog } from "./types.ts";

const MAX = 10;

export type UndoEntry = {
  label: string;
  tasks?: PlanTask[];
  days?: StudyDayLog[];
  plans?: StudyPlan[];
  watchLogs?: WatchLog[];
  activePlanId?: string | null;
};

let stack: UndoEntry[] = [];

export function pushUndo(entry: UndoEntry) {
  stack = [...stack.slice(-(MAX - 1)), { ...entry }];
}

export function peekUndo(): UndoEntry | null {
  return stack[stack.length - 1] ?? null;
}

export function popUndo(): UndoEntry | null {
  const last = stack[stack.length - 1];
  if (!last) return null;
  stack = stack.slice(0, -1);
  return last;
}

export function clearUndo() {
  stack = [];
}

export function applyUndoEntry(state: PlannerState, entry: UndoEntry): PlannerState {
  let plans = state.plans;
  if (entry.plans?.length) {
    const byId = new Map(plans.map((p) => [p.id, p]));
    for (const p of entry.plans) byId.set(p.id, p);
    plans = [...byId.values()];
  }
  if (entry.tasks?.length) {
    const grouped = new Map<string, PlanTask[]>();
    for (const t of entry.tasks) {
      const plan = plans.find((p) => p.tasks.some((x) => x.id === t.id)) ?? plans.find((p) => p.active);
      if (!plan) continue;
      const list = grouped.get(plan.id) ?? [];
      list.push(t);
      grouped.set(plan.id, list);
    }
    plans = plans.map((p) => {
      const restore = grouped.get(p.id);
      if (!restore) return p;
      const map = new Map(p.tasks.map((t) => [t.id, t]));
      for (const t of restore) map.set(t.id, t);
      return { ...p, tasks: [...map.values()] };
    });
  }
  let days = state.days;
  if (entry.days?.length) {
    const map = new Map(days.map((d) => [d.date, d]));
    for (const d of entry.days) map.set(d.date, d);
    days = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  let watchLogs = state.watchLogs;
  if (entry.watchLogs?.length) {
    const key = (w: WatchLog) => `${w.lessonId}:${w.date}`;
    const map = new Map(watchLogs.map((w) => [key(w), w]));
    for (const w of entry.watchLogs) map.set(key(w), w);
    watchLogs = [...map.values()];
  }
  return {
    ...state,
    plans,
    days,
    watchLogs,
    activePlanId: entry.activePlanId !== undefined ? entry.activePlanId : state.activePlanId,
  };
}

export function undoStackSize() {
  return stack.length;
}
