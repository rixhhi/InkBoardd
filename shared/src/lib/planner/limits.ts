export const PLANNER_LIMITS = {
  maxPlans: 40,
  maxTasksPerPlan: 4000,
  maxBatch: 800,
  maxDays: 800,
  maxSessions: 2000,
  maxJournal: 800,
  maxBadges: 80,
} as const;

export class PlannerLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlannerLimitError";
  }
}

export function assertBatchSize(n: number, max: number = PLANNER_LIMITS.maxBatch, label = "rows") {
  if (n > max) throw new PlannerLimitError(`Too many ${label} in one save (${n} > ${max}).`);
}

export function assertPlanCount(n: number) {
  if (n > PLANNER_LIMITS.maxPlans) throw new PlannerLimitError(`At most ${PLANNER_LIMITS.maxPlans} plans.`);
}

export function assertTaskCount(n: number) {
  if (n > PLANNER_LIMITS.maxTasksPerPlan) {
    throw new PlannerLimitError(`A plan can hold at most ${PLANNER_LIMITS.maxTasksPerPlan} classes.`);
  }
}
