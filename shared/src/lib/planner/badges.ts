import { nowIso, todayKey } from "./dates.ts";
import type { StudySession } from "./sessions.ts";
import type { StreakResult } from "./streaks.ts";
import { liveTasks, type PlannerState, type StudyPlan } from "./types.ts";
import { markDirty } from "./dirty.ts";

export type BadgeTier = "bronze" | "silver" | "gold";
export type BadgeCategory = "Consistency" | "Lectures" | "Time" | "Revision" | "Reflection" | "Comeback";
export type BadgeMetric =
  | "lectures"
  | "streak"
  | "hours"
  | "revisions"
  | "solidReviews"
  | "focusBlocks"
  | "comebacks"
  | "perfectWeeks"
  | "caughtUp"
  | "coverage";

export type BadgeDef = {
  id: string;
  title: string;
  category: BadgeCategory;
  tier: BadgeTier;
  metric: BadgeMetric;
  target: number;
  criteria: string;
};

export type EarnedBadge = { id: string; earnedAt: string; updatedAt: string; deletedAt: string | null };

export type BadgeProgress = BadgeDef & {
  value: number;
  earned: boolean;
  earnedAt: string | null;
  percent: number;
};

export const BADGE_DEFS: BadgeDef[] = [
  { id: "first-lecture", title: "First lecture", category: "Lectures", tier: "bronze", metric: "lectures", target: 1, criteria: "Finish one lecture in a plan." },
  { id: "lectures-10", title: "10 lectures", category: "Lectures", tier: "bronze", metric: "lectures", target: 10, criteria: "Finish 10 lectures." },
  { id: "lectures-50", title: "50 lectures", category: "Lectures", tier: "silver", metric: "lectures", target: 50, criteria: "Finish 50 lectures." },
  { id: "lectures-100", title: "100 lectures", category: "Lectures", tier: "gold", metric: "lectures", target: 100, criteria: "Finish 100 lectures." },
  { id: "lectures-250", title: "250 lectures", category: "Lectures", tier: "gold", metric: "lectures", target: 250, criteria: "Finish 250 lectures." },
  { id: "streak-7", title: "7-day streak", category: "Consistency", tier: "bronze", metric: "streak", target: 7, criteria: "Study 7 days in a row." },
  { id: "streak-30", title: "30-day streak", category: "Consistency", tier: "silver", metric: "streak", target: 30, criteria: "Study 30 days in a row." },
  { id: "streak-100", title: "100-day streak", category: "Consistency", tier: "gold", metric: "streak", target: 100, criteria: "Study 100 days in a row." },
  { id: "hours-10", title: "10 hours", category: "Time", tier: "bronze", metric: "hours", target: 10, criteria: "Log 10 hours of study." },
  { id: "hours-50", title: "50 hours", category: "Time", tier: "silver", metric: "hours", target: 50, criteria: "Log 50 hours of study." },
  { id: "hours-250", title: "250 hours", category: "Time", tier: "gold", metric: "hours", target: 250, criteria: "Log 250 hours of study." },
  { id: "first-revision", title: "First revision", category: "Revision", tier: "bronze", metric: "revisions", target: 1, criteria: "Complete a revision task." },
  { id: "solid-20", title: "20 solid reviews", category: "Revision", tier: "silver", metric: "solidReviews", target: 20, criteria: "Rate 20 reviews Solid." },
  { id: "week-100", title: "100% week", category: "Consistency", tier: "silver", metric: "perfectWeeks", target: 1, criteria: "Finish every planned task in a week." },
  { id: "caught-up", title: "Caught up", category: "Comeback", tier: "silver", metric: "caughtUp", target: 1, criteria: "Clear overdue lectures after falling behind." },
  { id: "focus-7", title: "7 focus blocks", category: "Reflection", tier: "bronze", metric: "focusBlocks", target: 7, criteria: "Finish 7 timed focus blocks." },
  { id: "comeback-3", title: "Comeback ×3", category: "Comeback", tier: "gold", metric: "comebacks", target: 3, criteria: "Return after 3+ idle days, three times." },
  { id: "coverage", title: "Used every feature", category: "Comeback", tier: "gold", metric: "coverage", target: 5, criteria: "Plan, watch, revise, focus, and log study." },
];

export const BADGES_KEY = "inkboard.planner.badges.v1";

export type BadgeContext = {
  state: PlannerState;
  plan: StudyPlan | null;
  streak: StreakResult;
  sessions: StudySession[];
  comebacks: number;
  caughtUp: boolean;
};

export function badgeMetricValue(ctx: BadgeContext, metric: BadgeMetric): number {
  const plan = ctx.plan;
  const tasks = plan ? liveTasks(plan.tasks) : [];
  if (metric === "lectures") return tasks.filter((t) => t.type === "lesson" && t.status === "done").length;
  if (metric === "streak") return Math.max(ctx.streak.current, ctx.streak.longest);
  if (metric === "hours") return Math.round(ctx.state.days.reduce((n, d) => n + d.minutesStudied, 0) / 60);
  if (metric === "revisions") return tasks.filter((t) => t.type === "revision" && t.status === "done").length;
  if (metric === "solidReviews") return (plan?.reviews ?? []).filter((r) => r.lastRating === "solid").length;
  if (metric === "focusBlocks") return ctx.sessions.filter((s) => s.source === "focus" && !s.deletedAt).length;
  if (metric === "comebacks") return ctx.comebacks;
  if (metric === "perfectWeeks") {
    if (!plan) return 0;
    const byWeek = new Map<string, { done: number; total: number }>();
    for (const t of tasks) {
      const week = t.date.slice(0, 7);
      const cur = byWeek.get(week) ?? { done: 0, total: 0 };
      cur.total += 1;
      if (t.status === "done") cur.done += 1;
      byWeek.set(week, cur);
    }
    return [...byWeek.values()].filter((w) => w.total > 0 && w.done === w.total).length;
  }
  if (metric === "caughtUp") return ctx.caughtUp ? 1 : 0;
  const sources = new Set(ctx.sessions.map((s) => s.source));
  const used = [
    Boolean(plan),
    sources.has("watch") || sources.has("focus"),
    tasks.some((t) => t.type === "revision" && t.status === "done"),
    sources.has("focus"),
    sources.has("manual"),
  ].filter(Boolean).length;
  return used;
}

export function evaluateBadges(ctx: BadgeContext, earned: EarnedBadge[] = []): BadgeProgress[] {
  const earnedMap = new Map(earned.map((e) => [e.id, e.earnedAt]));
  return BADGE_DEFS.map((def) => {
    const value = badgeMetricValue(ctx, def.metric);
    const done = value >= def.target;
    return {
      ...def,
      value,
      earned: done,
      earnedAt: earnedMap.get(def.id) ?? (done ? null : null),
      percent: Math.min(100, Math.round((value / Math.max(1, def.target)) * 100)),
    };
  });
}

function canStore() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
let cache: EarnedBadge[] | null = null;

function emit() {
  for (const cb of listeners) cb();
}

export const EMPTY_BADGES: EarnedBadge[] = Object.freeze([]) as unknown as EarnedBadge[];

export function getServerBadges(): EarnedBadge[] {
  return EMPTY_BADGES;
}

export function subscribeBadges(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function fillBadge(b: Partial<EarnedBadge> & { id: string }): EarnedBadge {
  return {
    id: b.id,
    earnedAt: b.earnedAt || nowIso(),
    updatedAt: b.updatedAt || b.earnedAt || nowIso(),
    deletedAt: b.deletedAt ?? null,
  };
}

export function readEarnedBadges(): EarnedBadge[] {
  if (cache) return cache;
  if (!canStore()) {
    cache = [];
    return cache;
  }
  try {
    const raw = localStorage.getItem(BADGES_KEY);
    if (!raw) {
      cache = [];
      return cache;
    }
    const parsed = JSON.parse(raw) as EarnedBadge[];
    cache = Array.isArray(parsed) ? parsed.filter((b) => b && typeof b.id === "string").map(fillBadge) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function writeEarnedBadges(list: EarnedBadge[]) {
  cache = list.map(fillBadge);
  if (canStore()) {
    try {
      localStorage.setItem(BADGES_KEY, JSON.stringify(cache));
    } catch {
      /* quota */
    }
  }
  emit();
  return cache;
}

export function persistNewlyEarned(progress: BadgeProgress[], today = todayKey()): BadgeProgress[] {
  const have = readEarnedBadges();
  const haveIds = new Set(have.filter((b) => !b.deletedAt).map((b) => b.id));
  const fresh: BadgeProgress[] = [];
  const at = nowIso();
  for (const b of progress) {
    if (b.earned && !haveIds.has(b.id)) {
      have.push({ id: b.id, earnedAt: `${today}T12:00:00.000Z`, updatedAt: at, deletedAt: null });
      fresh.push({ ...b, earnedAt: at });
    }
  }
  if (fresh.length) {
    markDirty({ badges: fresh.map((b) => b.id) });
    writeEarnedBadges(have);
  }
  return fresh;
}

export function withEarnedDates(progress: BadgeProgress[], earned = readEarnedBadges()): BadgeProgress[] {
  const map = new Map(earned.filter((e) => !e.deletedAt).map((e) => [e.id, e.earnedAt]));
  return progress.map((b) => ({ ...b, earnedAt: map.get(b.id) ?? b.earnedAt, earned: b.earned || map.has(b.id) }));
}

export function replaceBadges(list: EarnedBadge[]) {
  return writeEarnedBadges(list);
}

export function importBadges(incoming: EarnedBadge[]) {
  const { mergeBadges } = {
    mergeBadges: (a: EarnedBadge[], b: EarnedBadge[]) => {
      const map = new Map<string, EarnedBadge>();
      for (const row of [...a, ...b]) {
        const cur = map.get(row.id);
        if (!cur || (row.updatedAt || "") > (cur.updatedAt || "")) map.set(row.id, fillBadge(row));
      }
      return [...map.values()];
    },
  };
  return writeEarnedBadges(mergeBadges(readEarnedBadges(), incoming));
}

export function resetEarnedBadges() {
  cache = [];
  if (canStore()) {
    try {
      localStorage.removeItem(BADGES_KEY);
    } catch {
      /* ignore */
    }
  }
  emit();
}

