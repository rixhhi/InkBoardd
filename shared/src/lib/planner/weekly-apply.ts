import { addDaysKey } from "./dates.ts";
import { liveTasks, type StudyPlan } from "./types.ts";

export type WeeklyApplyKind = "skip-extra-lecture" | "move-revision-today" | "none";

export type WeeklyApply = {
  kind: WeeklyApplyKind;
  taskIds: string[];
  label: string;
};

export function weeklyApplyDiff(plan: StudyPlan, today: string, suggestion: string): WeeklyApply {
  const tasks = liveTasks(plan.tasks);
  const weekEnd = addDaysKey(today, 6);
  if (suggestion.includes("overdue revision")) {
    const ids = tasks.filter((t) => t.type === "revision" && t.status === "pending" && t.date < today).map((t) => t.id);
    return {
      kind: ids.length ? "move-revision-today" : "none",
      taskIds: ids,
      label: ids.length ? `Move ${ids.length} overdue revision${ids.length === 1 ? "" : "s"} to today.` : "Nothing to move.",
    };
  }
  if (suggestion.includes("extra lecture") || suggestion.includes("Protect one")) {
    const pending = tasks
      .filter((t) => t.type === "lesson" && t.status === "pending" && t.date >= today && t.date <= weekEnd && !t.pinned)
      .sort((a, b) => b.date.localeCompare(a.date) || b.orderIdx - a.orderIdx);
    const last = pending[0];
    return {
      kind: last ? "skip-extra-lecture" : "none",
      taskIds: last ? [last.id] : [],
      label: last ? `Skip “${last.title}” this week (Undo anytime).` : "No extra lecture left to drop.",
    };
  }
  return { kind: "none", taskIds: [], label: "No automatic change — keep the current pace." };
}

export function isApplyReady(diff: WeeklyApply): boolean {
  return diff.kind !== "none" && diff.taskIds.length > 0;
}
