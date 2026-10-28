import { streakDaysCopy } from "../copy.ts";
import type { StreakResult } from "@inkboard/shared/planner/streaks";

export const STREAK_RULES = [
  "Rest days and holidays neither count nor break the mark.",
  "One freeze a week covers a single missed study day.",
  "After 6pm local, an empty study day puts the mark at risk.",
  "Coming back after 3+ idle study days counts as a comeback.",
];

export type StreakMilestone = { at: number; label: string };

export const STREAK_MILESTONES: StreakMilestone[] = [
  { at: 1, label: "1-day streak" },
  { at: 3, label: "3-day streak" },
  { at: 7, label: "7-day streak" },
  { at: 14, label: "14-day streak" },
  { at: 30, label: "30-day streak" },
  { at: 100, label: "100-day streak" },
];

export function nextStreakMilestone(current: number): StreakMilestone {
  return STREAK_MILESTONES.find((m) => m.at > current) ?? STREAK_MILESTONES[STREAK_MILESTONES.length - 1]!;
}

function marksPhrase(n: number): string {
  return streakDaysCopy(n);
}

export function streakStateLabel(opts: {
  current: number;
  atRisk: boolean;
  savedByFreeze: boolean;
  freezeLeft: number;
  comebacks: number;
  longest?: number;
}): string {
  if (opts.atRisk) return "Mark at risk — write today";
  if (opts.savedByFreeze) return "A freeze kept the mark";
  if (opts.current === 0) return (opts.longest ?? 0) > 0 ? "Mark broken." : "No streak.";
  if (opts.comebacks > 0 && opts.current <= 2) return `Comeback · ${marksPhrase(opts.current).toLowerCase()}`;
  return `${marksPhrase(opts.current)}.`;
}

export function freezeCopy(streak: Pick<StreakResult, "freezeLeftThisWeek" | "savedByFreeze">): string {
  if (streak.savedByFreeze) return "A freeze covered a missed day.";
  if (streak.freezeLeftThisWeek < 1) return "Freeze already used this week.";
  return "One freeze left this week.";
}
