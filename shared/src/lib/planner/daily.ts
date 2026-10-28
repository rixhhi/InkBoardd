import { addDaysKey, hourOfSlot, weekdayOf } from "./dates.ts";
import { minutesOnDate } from "./charts.ts";
import { liveTasks, type PlanTask, type PlannerPrefs, type StudyDayLog, type StudyPlan } from "./types.ts";
import { isWorkDay } from "./scheduler.ts";

const TYPE_RANK: Record<PlanTask["type"], number> = {
  revision: 0,
  lesson: 1,
  dpp: 2,
  custom: 3,
};

export function orderQueue(tasks: PlanTask[]): PlanTask[] {
  return liveTasks(tasks)
    .slice()
    .sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.orderIdx - b.orderIdx);
}

export function queueRemaining(tasks: PlanTask[]): { pending: number; minutes: number } {
  const pending = liveTasks(tasks).filter((t) => t.status === "pending");
  return {
    pending: pending.length,
    minutes: pending.reduce((n, t) => n + t.durationMin, 0),
  };
}

export function formatClock(mins: number, hour12 = true): string {
  const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  if (!hour12) {
    return m ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : `${String(h).padStart(2, "0")}:00`;
  }
  const ampm = h >= 12 ? "pm" : "am";
  const hr = h % 12 || 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${ampm}` : `${hr}${ampm}`;
}

/** Estimated start clock for each queued task, based on the plan's time slot. */
export function queueClockTimes(
  tasks: PlanTask[],
  slot: PlannerPrefs["timeSlot"],
  hour12 = true,
): Map<string, string> {
  const ordered = orderQueue(tasks);
  let cursor = hourOfSlot(slot) * 60;
  const map = new Map<string, string>();
  for (const t of ordered) {
    map.set(t.id, formatClock(cursor, hour12));
    cursor += Math.max(5, t.durationMin);
  }
  return map;
}

export function overdueStudyDays(tasks: PlanTask[], today: string, prefs?: PlannerPrefs | null): string[] {
  const dates = [
    ...new Set(
      liveTasks(tasks)
        .filter((t) => t.status === "pending" && t.date < today && t.type === "lesson")
        .map((t) => t.date),
    ),
  ].sort();
  if (!prefs) return dates;
  return dates.filter((d) => isWorkDay(prefs, d));
}

export function isBehind(tasks: PlanTask[], today: string, prefs?: PlannerPrefs | null): boolean {
  return overdueStudyDays(tasks, today, prefs).length >= 2;
}

export function showCatchUp(behind: boolean, forced: boolean) {
  return behind || forced;
}

export function oldestOverdueIds(tasks: PlanTask[], today: string): string[] {
  const pending = liveTasks(tasks).filter((t) => t.status === "pending" && t.date < today);
  if (!pending.length) return [];
  const oldest = pending.reduce((a, t) => (t.date < a ? t.date : a), pending[0]!.date);
  return pending.filter((t) => t.date === oldest).map((t) => t.id);
}

export type CoachKind = "revision" | "lecture" | "catch-up" | "rest" | "done";

export type CoachAction = {
  kind: CoachKind;
  task: PlanTask | null;
  reason: string;
};

export function coachNext(today: PlanTask[], overdue: PlanTask[]): CoachAction {
  const liveToday = orderQueue(today);
  const liveOverdue = orderQueue(overdue);
  const overdueRev = liveOverdue.find((t) => t.type === "revision" && t.status === "pending");
  if (overdueRev) {
    return { kind: "revision", task: overdueRev, reason: "Overdue revision first — it fades if you wait." };
  }
  const todayRev = liveToday.find((t) => t.type === "revision" && t.status === "pending");
  if (todayRev) {
    return { kind: "revision", task: todayRev, reason: "Warm-up revision, then new lectures." };
  }
  const todayLec = liveToday.find((t) => t.type === "lesson" && t.status === "pending");
  if (todayLec) {
    return { kind: "lecture", task: todayLec, reason: "Next lecture in today’s queue." };
  }
  const todayOther = liveToday.find((t) => t.status === "pending");
  if (todayOther) {
    return { kind: "lecture", task: todayOther, reason: `Finish today’s ${todayOther.type}.` };
  }
  const overdueLec = liveOverdue.find((t) => t.status === "pending");
  if (overdueLec) {
    return { kind: "catch-up", task: overdueLec, reason: "Today is clear — catch up this overdue class." };
  }
  if (liveToday.length && liveToday.every((t) => t.status !== "pending")) {
    return { kind: "done", task: null, reason: "Today’s queue is done. Rest or journal." };
  }
  return { kind: "rest", task: null, reason: "Nothing scheduled. Log study if you already sat down." };
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function weekBars(
  days: StudyDayLog[],
  weekStart: string,
  goal: number,
  sessionMinutes: Record<string, number> = {},
) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysKey(weekStart, i);
    return { date, minutes: minutesOnDate(days, date, sessionMinutes[date] ?? 0), goal };
  });
}

export type HeatMode = "minutes" | "lectures";

export type HeatCell = {
  date: string;
  minutes: number;
  lectures: number;
  percent: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export function heatmapLevel(ratio: number): 0 | 1 | 2 | 3 | 4 {
  if (ratio <= 0) return 0;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 1) return 3;
  return 4;
}

export function activityHeatmap(input: {
  today: string;
  weeks?: number;
  days: StudyDayLog[];
  plan?: StudyPlan | null;
  mode?: HeatMode;
  weekStartsOn?: 0 | 1;
}): { start: string; end: string; cells: HeatCell[][] } {
  const weeks = input.weeks ?? 12;
  const mode = input.mode ?? "minutes";
  const weekStartsOn = input.weekStartsOn ?? 1;
  const goal =
    mode === "lectures"
      ? input.plan?.prefs.lecturesPerDay || 3
      : input.plan?.prefs.dailyMinutes || 90;
  const wd = weekdayOf(input.today);
  const offset = weekStartsOn === 0 ? wd : wd === 0 ? 6 : wd - 1;
  const weekEnd = addDaysKey(input.today, 6 - offset);
  const start = addDaysKey(weekEnd, -(weeks * 7 - 1));
  const map = new Map(input.days.map((d) => [d.date, d]));
  const cells: HeatCell[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = addDaysKey(start, w * 7 + d);
      const row = map.get(date);
      const minutes = row?.minutesStudied ?? 0;
      const lectures = row?.tasksDone ?? 0;
      const value = mode === "lectures" ? lectures : minutes;
      const percent = goal ? value / goal : 0;
      col.push({ date, minutes, lectures, percent, level: heatmapLevel(percent) });
    }
    cells.push(col);
  }
  return { start, end: weekEnd, cells };
}

export function progressPercent(value: number, max = 100): number {
  if (!max) return 0;
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

/** Arrow/Home/End/Escape movement for the activity heatmap grid. */
export function heatmapMove(focus: string, key: string, dates: string[]): string | null {
  if (key === "Escape") return null;
  const set = new Set(dates);
  let next = focus;
  if (key === "ArrowLeft") next = addDaysKey(focus, -7);
  else if (key === "ArrowRight") next = addDaysKey(focus, 7);
  else if (key === "ArrowUp") next = addDaysKey(focus, -1);
  else if (key === "ArrowDown") next = addDaysKey(focus, 1);
  else if (key === "Home") next = dates[0] ?? focus;
  else if (key === "End") next = dates[dates.length - 1] ?? focus;
  else return focus;
  if (key === "Home" || key === "End") return next;
  return set.has(next) ? next : focus;
}

export function heatLabel(cell: HeatCell, goal: number, mode: HeatMode): string {
  const pct = Math.round(cell.percent * 100);
  if (mode === "lectures") {
    return `${cell.date}: ${cell.lectures} lecture${cell.lectures === 1 ? "" : "s"} · ${pct}% of goal (${goal})`;
  }
  return `${cell.date}: ${cell.minutes} min · ${pct}% of goal`;
}

export type ShortenPlan = {
  dropIds: string[];
  keepIds: string[];
  reason: string;
};

/**
 * Low-energy day: drop optional DPP first, then newest pending lectures until
 * remaining lectures <= hardMax-1. Revision and custom stay.
 */
export function shortenDay(tasks: PlanTask[], hardMax: number): ShortenPlan {
  const live = orderQueue(tasks);
  const pending = live.filter((t) => t.status === "pending");
  const drop: string[] = [];
  for (const t of pending.filter((x) => x.type === "dpp")) drop.push(t.id);
  const lectures = pending.filter((x) => x.type === "lesson" && !drop.includes(x.id));
  const cap = Math.max(1, hardMax - 1);
  if (lectures.length > cap) {
    const extra = lectures.slice(cap);
    for (const t of extra) drop.push(t.id);
  }
  const keep = live.filter((t) => t.status !== "pending" || !drop.includes(t.id)).map((t) => t.id);
  const reason = drop.length
    ? `Drop ${drop.length} item${drop.length === 1 ? "" : "s"} (DPP first, then extra lectures).`
    : "Already a short day.";
  return { dropIds: drop, keepIds: keep, reason };
}
