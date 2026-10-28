import { EMPTY_STATE, liveTasks, PLAN_COLORS, type PlanTask, type PlannerState, type StudyPlan } from "../types.ts";
import { nowIso } from "../dates.ts";
import { uid } from "../ids.ts";
import { mergePlannerStates } from "../merge.ts";
import { markDirty, resetDirty } from "../dirty.ts";
import { importSessions, resetSessions } from "../sessions.ts";
import { resetWatchStore } from "../watch-store.ts";
import { importJournal, resetJournal } from "../journal.ts";
import { importBadges, resetEarnedBadges } from "../badges.ts";
import { clearUndo } from "../undo.ts";
import { activePlanOf, archivedPlansOf, visiblePlansOf } from "./queries.ts";
import { captureUndo, patchPlanner, readPlanner, stampPlan, writePlanner } from "./core.ts";

export function visiblePlans(state: PlannerState = readPlanner()): StudyPlan[] {
  return visiblePlansOf(state);
}

export function archivedPlans(state: PlannerState = readPlanner()): StudyPlan[] {
  return archivedPlansOf(state);
}

export function activePlan(state: PlannerState = readPlanner()): StudyPlan | null {
  return activePlanOf(state);
}

export function upsertPlan(plan: StudyPlan, makeActive = true) {
  const at = nowIso();
  const next = stampPlan({ ...plan, deletedAt: plan.deletedAt ?? null, archived: makeActive ? false : plan.archived }, at);
  return patchPlanner((s) => {
    const plans = s.plans.filter((p) => p.id !== next.id);
    const rest = makeActive ? plans.map((p) => stampPlan({ ...p, active: false }, at)) : plans;
    const inserted = { ...next, active: makeActive };
    rest.unshift(inserted);
    return {
      ...s,
      plans: rest,
      activePlanId: makeActive ? inserted.id : s.activePlanId ?? inserted.id,
    };
  });
}

export function deletePlan(planId: string) {
  const at = nowIso();
  captureUndo("delete plan", (s) => ({
    plans: s.plans.filter((p) => p.id === planId),
    activePlanId: s.activePlanId,
  }));
  return patchPlanner((s) => {
    const plans = s.plans.map((p) =>
      p.id === planId ? stampPlan({ ...p, deletedAt: at, active: false, archived: false }, at) : p,
    );
    const visible = plans.filter((p) => !p.deletedAt && !p.archived);
    const activePlanId = visible[0]?.id ?? null;
    return {
      ...s,
      plans: plans.map((p) => (p.id === activePlanId ? stampPlan({ ...p, active: true }, at) : { ...p, active: false })),
      activePlanId,
    };
  });
}

export function setActivePlan(planId: string) {
  const at = nowIso();
  return patchPlanner((s) => ({
    ...s,
    activePlanId: planId,
    plans: s.plans.map((p) =>
      stampPlan({ ...p, active: p.id === planId && !p.deletedAt, archived: p.id === planId ? false : p.archived }, at),
    ),
  }));
}

export function archivePlan(planId: string, archived = true) {
  const at = nowIso();
  captureUndo("archive plan", (s) => ({
    plans: s.plans.filter((p) => p.id === planId),
    activePlanId: s.activePlanId,
  }));
  return patchPlanner((s) => {
    const plans = s.plans.map((p) =>
      p.id === planId ? stampPlan({ ...p, archived, active: archived ? false : p.active }, at) : p,
    );
    const visible = plans.filter((p) => !p.deletedAt && !p.archived);
    const keepActive = !archived ? planId : s.activePlanId === planId ? (visible[0]?.id ?? null) : s.activePlanId;
    return {
      ...s,
      plans: plans.map((p) => (p.id === keepActive ? stampPlan({ ...p, active: true, archived: false }, at) : p)),
      activePlanId: keepActive,
    };
  });
}

export function duplicatePlan(planId: string) {
  const src = readPlanner().plans.find((p) => p.id === planId && !p.deletedAt);
  if (!src) return readPlanner();
  const at = nowIso();
  const copy: StudyPlan = {
    ...src,
    id: uid("plan"),
    name: src.name.endsWith(" copy") ? src.name : `${src.name} copy`,
    active: false,
    archived: false,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    color: PLAN_COLORS[(PLAN_COLORS.indexOf(src.color as (typeof PLAN_COLORS)[number]) + 1) % PLAN_COLORS.length],
    tasks: liveTasks(src.tasks).map((t) => ({ ...t, id: uid("tsk"), updatedAt: at, deletedAt: null })),
    reviews: (src.reviews ?? []).map((r) => ({ ...r })),
  };
  return upsertPlan(copy, true);
}

export function setPlanColor(planId: string, color: string) {
  return patchPlan(planId, { color });
}

export function replacePlanTasks(planId: string, tasks: PlanTask[], endDate?: string) {
  const at = nowIso();
  captureUndo("replace tasks", (s) => ({
    tasks: s.plans.find((p) => p.id === planId)?.tasks ?? [],
  }));
  return patchPlanner((s) => ({
    ...s,
    plans: s.plans.map((p) => {
      if (p.id !== planId) return p;
      const incomingIds = new Set(tasks.map((t) => t.id));
      const leftovers = p.tasks
        .filter((t) => !incomingIds.has(t.id))
        .map((t) => (t.status === "pending" && !t.deletedAt ? { ...t, deletedAt: at, updatedAt: at } : t));
      return stampPlan(
        {
          ...p,
          tasks: [...tasks.map((t) => ({ ...t, updatedAt: t.updatedAt || at })), ...leftovers],
          endDate: endDate ?? p.endDate,
        },
        at,
      );
    }),
  }));
}

export function patchPlan(planId: string, over: Partial<StudyPlan>) {
  const at = nowIso();
  return patchPlanner((s) => ({
    ...s,
    plans: s.plans.map((p) => (p.id === planId ? stampPlan({ ...p, ...over }, at) : p)),
  }));
}

export function importState(incoming: PlannerState) {
  if (!incoming || !Array.isArray(incoming.plans)) return readPlanner();
  return patchPlanner((s) => mergePlannerStates(s, incoming));
}

export function importRemoteBundle(bundle: {
  planner?: PlannerState;
  sessions?: Parameters<typeof importSessions>[0];
  journal?: Parameters<typeof importJournal>[0];
  badges?: Parameters<typeof importBadges>[0];
  plans?: PlannerState["plans"];
}) {
  const planner = bundle.planner ?? (Array.isArray(bundle.plans) ? (bundle as unknown as PlannerState) : null);
  if (planner && Array.isArray(planner.plans)) importState(planner);
  if (bundle.sessions) importSessions(bundle.sessions);
  if (bundle.journal) importJournal(bundle.journal);
  if (bundle.badges) importBadges(bundle.badges);
  return readPlanner();
}

export function replaceState(incoming: PlannerState) {
  writePlanner(incoming);
  markDirty({ full: true });
  return readPlanner();
}

export function resetPlannerWorkspace() {
  writePlanner({ ...EMPTY_STATE, version: 3, watchLogs: [] });
  markDirty({ full: true });
  resetSessions();
  resetWatchStore();
  resetDirty();
  resetJournal();
  resetEarnedBadges();
  clearUndo();
  return readPlanner();
}

export { liveTasks };
