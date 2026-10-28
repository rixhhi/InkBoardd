import { todayKey } from "./dates.ts";
import { liveTasks, type PlanTask, type StudyPlan } from "./types.ts";

export const TODAY_CACHE_KEY = "inkboard.planner.today-cache.v1";

export type TodayCache = {
  date: string;
  planName: string;
  tasks: Array<Pick<PlanTask, "id" | "title" | "type" | "status" | "durationMin" | "lessonId" | "teacher">>;
};

function canStore() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function cacheTodayPlan(plan: StudyPlan | null, date = todayKey()) {
  if (!canStore()) return;
  if (!plan) {
    try {
      localStorage.removeItem(TODAY_CACHE_KEY);
    } catch {
      /* quota */
    }
    return;
  }
  const tasks = liveTasks(plan.tasks)
    .filter((t) => t.date === date)
    .map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      status: t.status,
      durationMin: t.durationMin,
      lessonId: t.lessonId,
      teacher: t.teacher,
    }));
  const payload: TodayCache = { date, planName: plan.name, tasks };
  try {
    localStorage.setItem(TODAY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function readTodayCache(): TodayCache | null {
  if (!canStore()) return null;
  try {
    const raw = localStorage.getItem(TODAY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TodayCache;
    if (!parsed?.date || !Array.isArray(parsed.tasks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
