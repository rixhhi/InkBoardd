import { addDaysKey, compareKeys, diffDays, todayKey, weekId } from "./dates.ts";
import { isWorkDay } from "./scheduler.ts";
import type { PlanTask, PlannerPrefs, StudyDayLog, StudyPlan } from "./types.ts";

const MAX_STREAK_STEPS = 800;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type StreakResult = {
  current: number;
  longest: number;
  freezeUsed: boolean;
  countedDates: string[];
  usedWeeks: string[];
  consumedWeeks: string[];
  freezeLeftThisWeek: number;
  savedByFreeze: boolean;
};

export function dayQualifies(
  log: StudyDayLog | undefined,
  tasks: PlanTask[],
  date: string,
  minMinutes: number,
): boolean {
  if ((log?.tasksDone ?? 0) >= 1) return true;
  if ((log?.minutesStudied ?? 0) >= minMinutes) return true;
  return tasks.some((t) => t.status === "done" && t.completedAt?.slice(0, 10) === date);
}

function validKey(key: string | undefined): key is string {
  return Boolean(key && KEY_RE.test(key));
}

function isOffDay(date: string, prefs?: PlannerPrefs | null): boolean {
  if (!prefs) return false;
  return !isWorkDay(prefs, date);
}

/**
 * One freeze per ISO week protects exactly one missed work day in that week.
 * A freeze already stored still protects that one miss (so a reload doesn't
 * break the streak). A second miss in the same week is not protected.
 */
export function computeStreaks(
  days: StudyDayLog[],
  tasks: PlanTask[],
  freezeWeeks: string[],
  today: string,
  minMinutes = 20,
  prefs?: PlannerPrefs | null,
): StreakResult {
  const todaySafe = validKey(today) ? today : todayKey();
  const logs = new Map(days.filter((d) => validKey(d.date)).map((d) => [d.date, d]));
  const stored = new Set(freezeWeeks.filter(Boolean));
  const consumed = new Set<string>();
  const counted: string[] = [];
  let longest = 0;
  let run = 0;
  let freezeUsed = false;
  let savedByFreeze = false;

  const taskDates = tasks.map((t) => t.date).filter(validKey);
  const dayDates = days.map((d) => d.date).filter(validKey);
  const start = taskDates.length
    ? taskDates.reduce((a, d) => (d < a ? d : a))
    : dayDates.length
      ? dayDates.reduce((a, d) => (d < a ? d : a))
      : todaySafe;
  if (!validKey(start)) {
    return {
      current: 0,
      longest: 0,
      freezeUsed: false,
      countedDates: [],
      usedWeeks: [],
      consumedWeeks: [],
      freezeLeftThisWeek: 1,
      savedByFreeze: false,
    };
  }

  let cursor = start;
  let steps = 0;
  while (compareKeys(cursor, todaySafe) <= 0 && steps < MAX_STREAK_STEPS) {
    steps += 1;
    if (isOffDay(cursor, prefs)) {
      cursor = addDaysKey(cursor, 1);
      if (!validKey(cursor)) break;
      continue;
    }
    const ok = dayQualifies(logs.get(cursor), tasks, cursor, minMinutes);
    if (ok) {
      run += 1;
      counted.push(cursor);
    } else if (cursor === todaySafe) {
      // Today is still in progress — don't freeze or break yet.
    } else if (run > 0 && !consumed.has(weekId(cursor))) {
      const week = weekId(cursor);
      consumed.add(week);
      freezeUsed = true;
      if (!stored.has(week)) savedByFreeze = true;
      run += 1;
      counted.push(cursor);
    } else {
      longest = Math.max(longest, run);
      run = 0;
    }
    longest = Math.max(longest, run);
    cursor = addDaysKey(cursor, 1);
    if (!validKey(cursor)) break;
  }

  let current = 0;
  const countedSet = new Set(counted);
  cursor = todaySafe;
  if (
    isOffDay(cursor, prefs) ||
    (!dayQualifies(logs.get(todaySafe), tasks, todaySafe, minMinutes) && !countedSet.has(todaySafe))
  ) {
    cursor = addDaysKey(todaySafe, -1);
  }
  steps = 0;
  while (validKey(cursor) && compareKeys(cursor, start) >= 0 && steps < MAX_STREAK_STEPS) {
    steps += 1;
    if (isOffDay(cursor, prefs)) {
      cursor = addDaysKey(cursor, -1);
      continue;
    }
    if (dayQualifies(logs.get(cursor), tasks, cursor, minMinutes) || countedSet.has(cursor)) {
      current += 1;
    } else {
      break;
    }
    cursor = addDaysKey(cursor, -1);
  }

  const thisWeek = weekId(todaySafe);
  const freezeLeftThisWeek = stored.has(thisWeek) || consumed.has(thisWeek) ? 0 : 1;

  return {
    current,
    longest: Math.max(longest, current),
    freezeUsed,
    countedDates: counted,
    usedWeeks: [...new Set([...stored, ...consumed])].sort(),
    consumedWeeks: [...consumed].sort(),
    freezeLeftThisWeek,
    savedByFreeze,
  };
}

export function applyFreeze(freezeWeeks: string[], missedDate: string): string[] {
  const week = weekId(missedDate);
  if (freezeWeeks.includes(week)) return freezeWeeks;
  return [...freezeWeeks, week];
}

export function streakAtRisk(
  prefs: PlannerPrefs,
  today: string,
  days: StudyDayLog[],
  tasks: PlanTask[],
  now: Date,
): boolean {
  if (!isWorkDay(prefs, today)) return false;
  if (now.getHours() < 18) return false;
  return !dayQualifies(
    days.find((d) => d.date === today),
    tasks,
    today,
    prefs.streakMinutes,
  );
}

export type PaceStatus = "ahead" | "on-track" | "behind";

export function trailingAverage(days: StudyDayLog[], today: string, prefs: PlannerPrefs, window = 14): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < window; i += 1) {
    const key = addDaysKey(today, -i);
    if (!isWorkDay(prefs, key)) continue;
    n += 1;
    sum += days.find((d) => d.date === key)?.minutesStudied ?? 0;
  }
  if (!n) return prefs.dailyMinutes;
  const avg = sum / n;
  return avg > 0 ? avg : prefs.dailyMinutes;
}

export function planPace(
  plan: StudyPlan,
  today: string,
  days: StudyDayLog[] = [],
): {
  status: PaceStatus;
  daysDelta: number;
  lessonsDelta: number;
  percentLessons: number;
  percentHours: number;
  remainingLessons: number;
  remainingMinutes: number;
  projectedFinish: string | null;
  catchUpMinutes: number | null;
} {
  const tasks = plan.tasks.filter((t) => !t.deletedAt);
  const lessons = tasks.filter((t) => t.type === "lesson");
  const done = lessons.filter((t) => t.status === "done");
  const remaining = lessons.filter((t) => t.status === "pending");
  const remainingMinutes = remaining.reduce((n, t) => n + t.durationMin, 0);
  const doneMinutes = done.reduce((n, t) => n + t.durationMin, 0);
  const totalMinutes = Math.max(1, doneMinutes + remainingMinutes);
  const percentLessons = Math.round((done.length / Math.max(1, lessons.length)) * 100);
  const percentHours = Math.round((doneMinutes / totalMinutes) * 100);
  const avg = trailingAverage(days, today, plan.prefs);
  let projectedFinish: string | null = null;
  if (remainingMinutes > 0) {
    let left = remainingMinutes;
    let cursor = today;
    let guard = 0;
    while (left > 0 && guard < 800) {
      guard += 1;
      if (isWorkDay(plan.prefs, cursor) && cursor >= today) {
        left -= avg;
      }
      if (left <= 0) {
        projectedFinish = cursor;
        break;
      }
      cursor = addDaysKey(cursor, 1);
    }
  } else {
    projectedFinish = today;
  }
  const daysDelta = projectedFinish ? diffDays(plan.endDate, projectedFinish) : 0;
  const lessonsDelta = remaining.length;
  const status: PaceStatus = daysDelta > 1 ? "ahead" : daysDelta < -1 ? "behind" : "on-track";
  const catchUpMinutes =
    status === "behind" && remainingMinutes > 0
      ? Math.ceil(remainingMinutes / Math.max(1, diffDays(plan.endDate, today)))
      : null;
  return {
    status,
    daysDelta,
    lessonsDelta,
    percentLessons,
    percentHours,
    remainingLessons: remaining.length,
    remainingMinutes,
    projectedFinish,
    catchUpMinutes,
  };
}

export function paceLabel(pace: { status: PaceStatus; daysDelta: number }): string {
  if (pace.status === "on-track") return "On track";
  const n = Math.abs(pace.daysDelta);
  return pace.status === "ahead" ? `${n} day${n === 1 ? "" : "s"} ahead` : `${n} day${n === 1 ? "" : "s"} behind`;
}

export function milestones(plan: StudyPlan, streak: StreakResult): { id: string; label: string; earned: boolean }[] {
  const done = plan.tasks.filter((t) => t.type === "lesson" && t.status === "done").length;
  const hours = plan.tasks.filter((t) => t.status === "done").reduce((n, t) => n + t.durationMin, 0) / 60;
  return [
    { id: "first", label: "First lecture", earned: done >= 1 },
    { id: "week", label: "7-day streak", earned: streak.current >= 7 || streak.longest >= 7 },
    { id: "hundred", label: "100 lectures", earned: done >= 100 },
  ].concat(hours >= 10 ? [{ id: "hours", label: "10 hours", earned: true }] : [{ id: "hours", label: "10 hours", earned: false }]);
}

export function comebackCount(
  days: StudyDayLog[],
  tasks: PlanTask[],
  today: string,
  minMinutes = 20,
  prefs?: PlannerPrefs | null,
): number {
  const logs = new Map(days.filter((d) => validKey(d.date)).map((d) => [d.date, d]));
  const startCandidates = [
    ...days.map((d) => d.date),
    ...tasks.map((t) => t.date),
    today,
  ].filter(validKey);
  if (!startCandidates.length) return 0;
  const start = startCandidates.reduce((a, d) => (d < a ? d : a));
  let idle = 0;
  let comebacks = 0;
  let seenStudy = false;
  let cursor = start;
  let steps = 0;
  while (compareKeys(cursor, today) <= 0 && steps < MAX_STREAK_STEPS) {
    steps += 1;
    if (prefs && !isWorkDay(prefs, cursor)) {
      cursor = addDaysKey(cursor, 1);
      continue;
    }
    const ok = dayQualifies(logs.get(cursor), tasks, cursor, minMinutes);
    if (ok) {
      if (seenStudy && idle >= 3) comebacks += 1;
      seenStudy = true;
      idle = 0;
    } else if (cursor !== today) {
      idle += 1;
    }
    cursor = addDaysKey(cursor, 1);
  }
  return comebacks;
}

export function isCaughtUp(tasks: PlanTask[], today: string): boolean {
  const live = tasks.filter((t) => !t.deletedAt);
  const hadOverdue = live.some(
    (t) => t.status === "done" && t.plannedDate && t.plannedDate < today && t.completedAt?.slice(0, 10) === today,
  );
  const stillOverdue = live.some((t) => t.status === "pending" && t.date < today && t.type === "lesson");
  return hadOverdue && !stillOverdue;
}
