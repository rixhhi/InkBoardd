import { addDaysKey, weekdayOf } from "./dates.ts";
import type { HistoryRow } from "./history.ts";
import { minutesOnDate } from "./charts.ts";
import { isWorkDay } from "./scheduler.ts";
import { liveTasks, type PlannerPrefs, type StudyDayLog, type StudyPlan } from "./types.ts";

export type AnalyticsRange = {
  from: string;
  to: string;
};

export type AnalyticsReport = {
  minutes: number;
  prevMinutes: number;
  minutesDelta: number;
  sessions: number;
  lecturesDone: number;
  lecturesPlanned: number;
  completionRate: number;
  goalHitRate: number;
  procrastinationIndex: number;
  bestHour: number | null;
  subjectSplit: { label: string; minutes: number }[];
  dayOfWeek: { day: string; minutes: number }[];
  buckets: { label: string; count: number }[];
  minutesPerDay: { date: string; minutes: number; goal: number }[];
  revision: { due: number; overdue: number; solid: number; shaky: number };
  weeklyReview: { bestDay: string | null; hours: number; done: number; planned: number; suggestion: string };
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function inRange(date: string, range: AnalyticsRange) {
  return date >= range.from && date <= range.to;
}

function hourOf(iso: string): number {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.getUTCHours() : -1;
}

function bucket(min: number): string {
  if (min < 20) return "0–19";
  if (min < 40) return "20–39";
  if (min < 60) return "40–59";
  if (min < 90) return "60–89";
  return "90+";
}

export function analyticsFor(opts: {
  plan: StudyPlan | null;
  days: StudyDayLog[];
  rows: HistoryRow[];
  range: AnalyticsRange;
  prev: AnalyticsRange;
  today: string;
}): AnalyticsReport {
  const { plan, days, rows, range, prev, today } = opts;
  const prefs: PlannerPrefs | null = plan?.prefs ?? null;
  const inRows = rows.filter((r) => inRange(r.date, range));
  const prevRows = rows.filter((r) => inRange(r.date, prev));
  const minutes = inRows.reduce((n, r) => n + r.durationMin, 0);
  const prevMinutes = prevRows.reduce((n, r) => n + r.durationMin, 0);
  const tasks = plan ? liveTasks(plan.tasks) : [];
  const lecturesPlanned = tasks.filter((t) => t.type === "lesson" && inRange(t.date, range)).length;
  const lecturesDone = tasks.filter((t) => t.type === "lesson" && t.status === "done" && t.completedAt && inRange(t.completedAt.slice(0, 10), range)).length;
  const completed = tasks.filter((t) => t.status === "done" && t.completedAt && inRange(t.completedAt.slice(0, 10), range));
  const late = completed.filter((t) => t.plannedDate && t.completedAt && t.completedAt.slice(0, 10) > t.plannedDate).length;
  const goal = prefs?.dailyMinutes ?? 90;
  const calendarDays: string[] = [];
  for (let d = range.from; d <= range.to; d = addDaysKey(d, 1)) calendarDays.push(d);
  const hit = calendarDays.filter((d) => (days.find((x) => x.date === d)?.minutesStudied ?? 0) >= goal).length;
  const hourCounts = new Map<number, number>();
  const subject = new Map<string, number>();
  const dow = [0, 0, 0, 0, 0, 0, 0];
  const bucketCounts = new Map<string, number>();
  for (const r of inRows) {
    const h = hourOf(r.startIso);
    if (h >= 0) hourCounts.set(h, (hourCounts.get(h) ?? 0) + r.durationMin);
    const label = r.subject || r.teacher || "Other";
    subject.set(label, (subject.get(label) ?? 0) + r.durationMin);
    const day = weekdayOf(r.date);
    dow[day] = (dow[day] ?? 0) + r.durationMin;
    const b = bucket(r.durationMin);
    bucketCounts.set(b, (bucketCounts.get(b) ?? 0) + 1);
  }
  let bestHour: number | null = null;
  let bestVal = 0;
  for (const [h, v] of hourCounts) {
    if (v > bestVal) {
      bestVal = v;
      bestHour = h;
    }
  }
  const reviews = plan?.reviews ?? [];
  const due = reviews.filter((r) => r.dueDate && r.dueDate <= today).length;
  const overdue = reviews.filter((r) => r.dueDate && r.dueDate < today).length;
  const solid = reviews.filter((r) => r.lastRating === "solid").length;
  const shaky = reviews.filter((r) => r.lastRating === "shaky").length;
  const weekStart = calendarDays[Math.max(0, calendarDays.length - 7)] ?? range.from;
  const weekDays = calendarDays.filter((d) => d >= weekStart);
  const weekDone = tasks.filter((t) => t.status === "done" && t.completedAt && weekDays.includes(t.completedAt.slice(0, 10))).length;
  const weekPlanned = tasks.filter((t) => weekDays.includes(t.date)).length;
  const best = [...days].filter((d) => inRange(d.date, range)).sort((a, b) => b.minutesStudied - a.minutesStudied)[0];
  const hours = Math.round((minutes / 60) * 10) / 10;
  let suggestion = "Keep the current pace.";
  if (lecturesPlanned && lecturesDone / Math.max(1, lecturesPlanned) < 0.7) suggestion = "Protect one extra lecture slot this week.";
  else if (overdue > 2) suggestion = "Clear overdue revision before stacking new lectures.";
  else if (prefs && weekDays.filter((d) => isWorkDay(prefs, d) && (days.find((x) => x.date === d)?.minutesStudied ?? 0) < goal / 2).length >= 3) {
    suggestion = "Hit the daily minutes goal on the next study day.";
  }

  return {
    minutes,
    prevMinutes,
    minutesDelta: minutes - prevMinutes,
    sessions: inRows.length,
    lecturesDone,
    lecturesPlanned,
    completionRate: lecturesPlanned ? lecturesDone / lecturesPlanned : 1,
    goalHitRate: calendarDays.length ? hit / calendarDays.length : 0,
    procrastinationIndex: completed.length ? late / completed.length : 0,
    bestHour,
    subjectSplit: [...subject.entries()].map(([label, mins]) => ({ label, minutes: mins })).sort((a, b) => b.minutes - a.minutes),
    dayOfWeek: DOW.map((day, i) => ({ day, minutes: dow[i] ?? 0 })),
    buckets: ["0–19", "20–39", "40–59", "60–89", "90+"].map((label) => ({ label, count: bucketCounts.get(label) ?? 0 })),
    minutesPerDay: calendarDays.map((date) => ({
      date,
      minutes: minutesOnDate(
        days,
        date,
        inRows.filter((r) => r.date === date).reduce((n, r) => n + r.durationMin, 0),
      ),
      goal,
    })),
    revision: { due, overdue, solid, shaky },
    weeklyReview: {
      bestDay: best?.date ?? null,
      hours,
      done: weekDone,
      planned: weekPlanned,
      suggestion,
    },
  };
}
