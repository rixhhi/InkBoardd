import type { PlanTask, PlannerState } from "./types.ts";
import { todayKey } from "./dates.ts";
import { resetDirty } from "./dirty.ts";
import { resetSessions } from "./sessions.ts";
import { resetWatchStore } from "./watch-store.ts";
import { resetJournal } from "./journal.ts";
import { resetEarnedBadges } from "./badges.ts";
import { overdueOn, tasksOnDate } from "./storage/queries.ts";
import { resetCoreCache, readPlanner } from "./storage/core.ts";
import { activePlan } from "./storage/plans.ts";

export {
  plannerQuotaError,
  getServerPlanner,
  readPlanner,
  writePlanner,
  subscribePlanner,
  notifyPlannerChanged,
  patchPlanner,
  captureUndo,
  snapshotUndo,
  undoLast,
} from "./storage/core.ts";

export {
  visiblePlans,
  archivedPlans,
  activePlan,
  upsertPlan,
  deletePlan,
  setActivePlan,
  archivePlan,
  duplicatePlan,
  setPlanColor,
  replacePlanTasks,
  patchPlan,
  importState,
  importRemoteBundle,
  replaceState,
  resetPlannerWorkspace,
  liveTasks,
} from "./storage/plans.ts";

export {
  setTaskStatus,
  moveTask,
  moveTasks,
  skipTasks,
  pinTask,
  reorderDay,
  addCustomTask,
  patchTask,
  rateRevision,
  carryForward,
  logManualStudy,
  completeLessonInPlan,
  skipOldestOverdue,
  reschedulePlan,
  stampTask,
} from "./storage/tasks.ts";

export { addWatchMinutes, mergeFreezeWeeks, setHolidays, addVacation } from "./storage/days.ts";

export { recordWatchTick, flushPlannerWatch } from "./storage/watch.ts";

const EMPTY_TASKS: PlanTask[] = [];
let todayCache: { key: string; tasks: PlanTask[] } | null = null;
let overdueCache: { key: string; tasks: PlanTask[] } | null = null;

export function todaysTasks(state: PlannerState = readPlanner(), date = todayKey()): PlanTask[] {
  const plan = activePlan(state);
  if (!plan) return EMPTY_TASKS;
  const key = `${plan.id}:${date}:${plan.updatedAt}:${plan.tasks.length}`;
  if (todayCache && todayCache.key === key) return todayCache.tasks;
  const tasks = tasksOnDate(plan, date);
  todayCache = { key, tasks };
  return tasks;
}

export function overdueTasks(state: PlannerState = readPlanner(), date = todayKey()): PlanTask[] {
  const plan = activePlan(state);
  if (!plan) return EMPTY_TASKS;
  const key = `${plan.id}:${date}:${plan.updatedAt}:${plan.tasks.length}:ov`;
  if (overdueCache && overdueCache.key === key) return overdueCache.tasks;
  const tasks = overdueOn(plan, date);
  overdueCache = { key, tasks };
  return tasks;
}

export function resetPlannerRuntime() {
  todayCache = null;
  overdueCache = null;
  resetCoreCache();
  resetDirty();
  resetWatchStore();
  resetSessions();
  resetJournal();
  resetEarnedBadges();
}
