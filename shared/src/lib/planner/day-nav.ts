import { addDaysKey, compareKeys, diffDays, formatDay, keysInRange } from "./dates.ts";
import { liveTasks } from "./storage/plans.ts";
import type { PlanTask, StudyPlan } from "./types.ts";

/** How far ahead the Tasks page lets you page. Past days are open as far as the plan goes. */
export const DAY_NAV_MAX_AHEAD = 60;

export type DayNavLabel = { title: string; relative: string | null };

/** `Today` / `Tomorrow` / `Yesterday` / `In 3 days` / `4 days ago` beside the full date. */
export function dayNavLabel(key: string, today: string): DayNavLabel {
  const title = formatDay(key, "EEEE d MMMM");
  const delta = diffDays(key, today);
  if (delta === 0) return { title, relative: "Today" };
  if (delta === 1) return { title, relative: "Tomorrow" };
  if (delta === -1) return { title, relative: "Yesterday" };
  if (delta > 1) return { title, relative: `In ${delta} days` };
  return { title, relative: `${-delta} days ago` };
}

export function canStepDay(key: string, today: string, dir: -1 | 1, plan?: Pick<StudyPlan, "startDate" | "endDate"> | null): boolean {
  const next = addDaysKey(key, dir);
  if (dir > 0) return diffDays(next, today) <= DAY_NAV_MAX_AHEAD;
  const floor = plan?.startDate && compareKeys(plan.startDate, today) < 0 ? plan.startDate : addDaysKey(today, -365);
  return compareKeys(next, floor) >= 0;
}

/** Parses `?day=` from the URL; anything odd falls back to today. */
export function dayFromSearch(raw: unknown, today: string): string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  const delta = diffDays(raw, today);
  if (delta > DAY_NAV_MAX_AHEAD || delta < -365) return today;
  return raw;
}

export type DayStripCell = { key: string; dow: string; dom: string; total: number; done: number; isToday: boolean; isCurrent: boolean; rest: boolean };

/** Seven cells around the current day — a strip you can tap to jump, with a tally per day. */
export function dayStrip(plan: StudyPlan | null, current: string, today: string, span = 7): DayStripCell[] {
  const half = Math.floor(span / 2);
  const from = addDaysKey(current, -half);
  const until = addDaysKey(current, span - half - 1);
  const tasks = plan ? liveTasks(plan.tasks) : [];
  const holidays = new Set(plan?.prefs?.holidays ?? []);
  const byDate = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    const cur = byDate.get(t.date) ?? { total: 0, done: 0 };
    cur.total += 1;
    if (t.status === "done") cur.done += 1;
    byDate.set(t.date, cur);
  }
  return keysInRange(from, until).map((key) => {
    const hit = byDate.get(key) ?? { total: 0, done: 0 };
    return {
      key,
      dow: formatDay(key, "EEE"),
      dom: formatDay(key, "d"),
      total: hit.total,
      done: hit.done,
      isToday: key === today,
      isCurrent: key === current,
      rest: holidays.has(key),
    };
  });
}

/** Tasks on one day, in board order (pinned first by orderIdx is preserved by the caller's orderQueue). */
export function tasksForDay(plan: StudyPlan | null, key: string): PlanTask[] {
  if (!plan) return [];
  return liveTasks(plan.tasks)
    .filter((t) => t.date === key)
    .sort((a, b) => a.orderIdx - b.orderIdx);
}

/** The headline for a non-today day: what's planned, how much is already struck. */
export function dayPlanCopy(tasks: PlanTask[], key: string, today: string): string {
  const delta = diffDays(key, today);
  const pending = tasks.filter((t) => t.status === "pending").length;
  const done = tasks.filter((t) => t.status === "done").length;
  if (!tasks.length) return delta > 0 ? "Nothing planned yet" : delta < 0 ? "Nothing was planned" : "Board clear";
  const mins = tasks.filter((t) => t.status === "pending").reduce((n, t) => n + t.durationMin, 0);
  if (delta > 0) return `${pending} planned · ${Math.round(mins)} min`;
  if (delta < 0) return done === tasks.length ? `All ${done} done` : `${done} of ${tasks.length} done`;
  return `${pending} left · ${Math.round(mins)} min`;
}
