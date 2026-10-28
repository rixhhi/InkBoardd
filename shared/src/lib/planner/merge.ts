import type { PlanTask, PlannerState, StudyDayLog, StudyPlan, SyncStatus, WatchLog } from "./types.ts";
import { TOMBSTONE_DAYS, liveTasks } from "./types.ts";
import { addDaysKey, compareIso, maxIso, todayKey } from "./dates.ts";
import { EPOCH_ISO } from "./types.ts";

function touchPlan(p: StudyPlan): string {
  return maxIso(p.updatedAt, p.deletedAt) || EPOCH_ISO;
}

function touchTask(t: PlanTask): string {
  return maxIso(t.updatedAt, t.deletedAt) || EPOCH_ISO;
}

export function mergeTasks(a: PlanTask[], b: PlanTask[]): PlanTask[] {
  const map = new Map<string, PlanTask>();
  for (const t of a) map.set(t.id, t);
  for (const t of b) {
    const cur = map.get(t.id);
    if (!cur || compareIso(touchTask(t), touchTask(cur)) > 0) map.set(t.id, t);
  }
  return [...map.values()].sort((x, y) => x.orderIdx - y.orderIdx || x.id.localeCompare(y.id));
}

function mergePlan(a: StudyPlan | undefined, b: StudyPlan | undefined): StudyPlan | null {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const aTouch = touchPlan(a);
  const bTouch = touchPlan(b);
  const newer = compareIso(aTouch, bTouch) >= 0 ? a : b;
  const tasks = mergeTasks(a.tasks, b.tasks);
  const deleted =
    newer.deletedAt && compareIso(newer.deletedAt, newer.updatedAt) >= 0 ? newer.deletedAt : null;
  return {
    ...newer,
    deletedAt: deleted,
    active: deleted ? false : newer.active,
    tasks,
  };
}

function mergeDays(a: StudyDayLog[], b: StudyDayLog[]): StudyDayLog[] {
  const map = new Map<string, StudyDayLog>();
  for (const d of [...a, ...b]) {
    const cur = map.get(d.date);
    if (!cur) {
      map.set(d.date, d);
      continue;
    }
    map.set(d.date, {
      date: d.date,
      minutesStudied: Math.max(cur.minutesStudied, d.minutesStudied),
      tasksDone: Math.max(cur.tasksDone, d.tasksDone),
      updatedAt: maxIso(cur.updatedAt, d.updatedAt) || cur.updatedAt,
    });
  }
  return [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
}

export function mergeWatch(a: WatchLog[], b: WatchLog[]): WatchLog[] {
  const map = new Map<string, WatchLog>();
  const key = (w: WatchLog) => `${w.lessonId}:${w.date}`;
  for (const w of [...a, ...b]) {
    const cur = map.get(key(w));
    if (!cur || compareIso(w.updatedAt, cur.updatedAt) > 0) map.set(key(w), w);
    else if (compareIso(w.updatedAt, cur.updatedAt) === 0 && w.seconds > cur.seconds) map.set(key(w), w);
  }
  return [...map.values()];
}

export function purgeTombstones(tasks: PlanTask[], today = todayKey()): PlanTask[] {
  const floor = addDaysKey(today, -TOMBSTONE_DAYS);
  return tasks.filter((t) => {
    if (!t.deletedAt) return true;
    return t.deletedAt.slice(0, 10) >= floor;
  });
}

export function mergePlannerStates(local: PlannerState, remote: PlannerState): PlannerState {
  const remotePlans = Array.isArray(remote?.plans) ? remote.plans : [];
  const localPlans = Array.isArray(local?.plans) ? local.plans : [];
  const ids = new Set([...localPlans.map((p) => p.id), ...remotePlans.map((p) => p.id)]);
  const localBy = new Map(localPlans.map((p) => [p.id, p]));
  const remoteBy = new Map(remotePlans.map((p) => [p.id, p]));
  const plans: StudyPlan[] = [];
  for (const id of ids) {
    const merged = mergePlan(localBy.get(id), remoteBy.get(id));
    if (merged) plans.push({ ...merged, tasks: purgeTombstones(merged.tasks) });
  }
  const visible = plans.filter((p) => !p.deletedAt);
  const activeId =
    (local.activePlanId && visible.some((p) => p.id === local.activePlanId) ? local.activePlanId : null) ??
    (remote?.activePlanId && visible.some((p) => p.id === remote.activePlanId) ? remote.activePlanId : null) ??
    visible.find((p) => p.active)?.id ??
    visible[0]?.id ??
    null;
  return {
    version: 3,
    plans: plans.map((p) => ({ ...p, active: p.id === activeId })),
    activePlanId: activeId,
    days: mergeDays(local.days ?? [], remote?.days ?? []),
    freezeWeeks: [...new Set([...(local.freezeWeeks ?? []), ...(remote?.freezeWeeks ?? [])])].sort(),
    watchLogs: mergeWatch(local.watchLogs ?? [], remote?.watchLogs ?? []),
  };
}

export function canPushRemote(status: SyncStatus): boolean {
  return status === "synced";
}

export { liveTasks };
