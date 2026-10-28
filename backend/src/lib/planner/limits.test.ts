import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLANNER_LIMITS, PlannerLimitError, assertBatchSize, assertPlanCount, assertTaskCount } from "@inkboard/shared/planner/limits";

describe("planner limits", () => {
  it("rejects oversized batches, plan counts and task lists", () => {
    assert.doesNotThrow(() => assertBatchSize(10));
    assert.throws(() => assertBatchSize(PLANNER_LIMITS.maxBatch + 1), PlannerLimitError);
    assert.throws(() => assertPlanCount(PLANNER_LIMITS.maxPlans + 1), PlannerLimitError);
    assert.throws(() => assertTaskCount(PLANNER_LIMITS.maxTasksPerPlan + 1), PlannerLimitError);
  });
});
