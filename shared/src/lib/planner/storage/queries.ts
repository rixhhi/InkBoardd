import { liveTasks, type PlanTask, type PlannerState, type StudyPlan } from "../types.ts";

export function visiblePlansOf(state: PlannerState): StudyPlan[] {
  return state.plans.filter((p) => !p.deletedAt && !p.archived);
}

export function archivedPlansOf(state: PlannerState): StudyPlan[] {
  return state.plans.filter((p) => !p.deletedAt && p.archived);
}

export function activePlanOf(state: PlannerState): StudyPlan | null {
  const visible = visiblePlansOf(state);
  if (state.activePlanId) return visible.find((p) => p.id === state.activePlanId) ?? visible[0] ?? null;
  return visible.find((p) => p.active) ?? visible[0] ?? null;
}

export function tasksOnDate(plan: StudyPlan | null | undefined, date: string): PlanTask[] {
  if (!plan) return [];
  return liveTasks(plan.tasks)
    .filter((t) => t.date === date)
    .sort((a, b) => a.orderIdx - b.orderIdx);
}

export function overdueOn(plan: StudyPlan | null | undefined, date: string): PlanTask[] {
  if (!plan) return [];
  return liveTasks(plan.tasks).filter((t) => t.status === "pending" && t.date < date);
}
