import { liveTasks, type StudyPlan } from "./planner/types.ts";

/** Course ids on the active plan — live planner state, never the Unacademy hub cache. */
export function plannedCourseIds(plan: StudyPlan | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!plan) return ids;
  for (const course of plan.courses ?? []) {
    if (course.courseId) ids.add(course.courseId);
  }
  for (const task of liveTasks(plan.tasks ?? [])) {
    if (task.courseId) ids.add(task.courseId);
  }
  return ids;
}

export function overlayInPlan<T extends { uid: string }>(rows: T[], planned: Set<string>): (T & { inPlan: boolean })[] {
  return rows.map((row) => ({ ...row, inPlan: planned.has(row.uid) }));
}
