import {
  DIRTY_KEY,
  EMPTY_DIRTY,
  type DeltaTask,
  type DirtySet,
  type PlannerDelta,
  type PlannerState,
  watchKeyOf,
} from "./types.ts";

function canStore() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

let cached: DirtySet = { ...EMPTY_DIRTY };

function unique(list: string[]) {
  return [...new Set(list.filter(Boolean))];
}

function normalize(parsed: Partial<DirtySet> = {}): DirtySet {
  return {
    plans: unique(parsed.plans ?? []),
    tasks: unique(parsed.tasks ?? []),
    days: unique(parsed.days ?? []),
    watch: unique(parsed.watch ?? []),
    sessions: unique(parsed.sessions ?? []),
    journal: unique(parsed.journal ?? []),
    badges: unique(parsed.badges ?? []),
    freeze: Boolean(parsed.freeze),
    full: Boolean(parsed.full),
  };
}

export function readDirty(): DirtySet {
  if (!canStore()) return { ...cached };
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    if (!raw) return { ...cached };
    cached = normalize(JSON.parse(raw) as Partial<DirtySet>);
    return { ...cached };
  } catch {
    return { ...cached };
  }
}

export function writeDirty(next: DirtySet) {
  cached = normalize(next);
  if (!canStore()) return;
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify(cached));
  } catch {
    /* quota */
  }
}

export function markDirty(over: Partial<DirtySet>) {
  const cur = readDirty();
  writeDirty({
    plans: unique([...cur.plans, ...(over.plans ?? [])]),
    tasks: unique([...cur.tasks, ...(over.tasks ?? [])]),
    days: unique([...cur.days, ...(over.days ?? [])]),
    watch: unique([...cur.watch, ...(over.watch ?? [])]),
    sessions: unique([...cur.sessions, ...(over.sessions ?? [])]),
    journal: unique([...cur.journal, ...(over.journal ?? [])]),
    badges: unique([...cur.badges, ...(over.badges ?? [])]),
    freeze: cur.freeze || Boolean(over.freeze),
    full: cur.full || Boolean(over.full),
  });
}

export function clearDirty() {
  writeDirty({ ...EMPTY_DIRTY });
}

export function resetDirty() {
  cached = { ...EMPTY_DIRTY };
  if (canStore()) {
    try {
      localStorage.removeItem(DIRTY_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function subtractDirty(current: DirtySet, sent: DirtySet): DirtySet {
  const minus = (have: string[], gone: string[]) => {
    if (!gone.length) return have;
    const drop = new Set(gone);
    return have.filter((id) => !drop.has(id));
  };
  return {
    plans: minus(current.plans, sent.plans),
    tasks: minus(current.tasks, sent.tasks),
    days: minus(current.days, sent.days),
    watch: minus(current.watch, sent.watch),
    sessions: minus(current.sessions, sent.sessions),
    journal: minus(current.journal, sent.journal),
    badges: minus(current.badges, sent.badges),
    freeze: Boolean(current.freeze && !sent.freeze),
    full: Boolean(current.full && !sent.full),
  };
}

/** Expand a full dirty flag into the ids that were actually sent. */
export function snapshotDirty(state: PlannerState, dirty: DirtySet): DirtySet {
  if (!dirty.full) return { ...dirty, plans: [...dirty.plans], tasks: [...dirty.tasks], days: [...dirty.days], watch: [...dirty.watch], sessions: [...dirty.sessions], journal: [...dirty.journal], badges: [...dirty.badges] };
  return {
    plans: state.plans.map((p) => p.id),
    tasks: state.plans.flatMap((p) => p.tasks.map((t) => t.id)),
    days: state.days.map((d) => d.date),
    watch: state.watchLogs.map((w) => watchKeyOf(w.lessonId, w.date)),
    sessions: [...dirty.sessions],
    journal: [...dirty.journal],
    badges: [...dirty.badges],
    freeze: true,
    full: true,
  };
}

export function clearDirtySent(sent: DirtySet) {
  writeDirty(subtractDirty(readDirty(), sent));
}

export function hasDirty(d: DirtySet = readDirty()) {
  return (
    d.full ||
    d.freeze ||
    d.plans.length +
      d.tasks.length +
      d.days.length +
      d.watch.length +
      d.sessions.length +
      d.journal.length +
      d.badges.length >
      0
  );
}

export function buildDelta(state: PlannerState, dirty: DirtySet = readDirty()): PlannerDelta {
  if (dirty.full) {
    const tasks: DeltaTask[] = state.plans.flatMap((p) => p.tasks.map((t) => ({ ...t, planId: p.id })));
    return {
      plans: state.plans.map((p) => ({ ...p, tasks: [] })),
      tasks,
      days: state.days,
      watchLogs: state.watchLogs,
      freezeWeeks: state.freezeWeeks,
      activePlanId: state.activePlanId,
      full: true,
    };
  }
  const planSet = new Set(dirty.plans);
  const taskSet = new Set(dirty.tasks);
  const daySet = new Set(dirty.days);
  const watchSet = new Set(dirty.watch);
  const plans = state.plans.filter((p) => planSet.has(p.id)).map((p) => ({ ...p, tasks: [] as typeof p.tasks }));
  const tasks: DeltaTask[] = [];
  for (const p of state.plans) {
    for (const t of p.tasks) {
      if (taskSet.has(t.id)) tasks.push({ ...t, planId: p.id });
    }
  }
  return {
    plans,
    tasks,
    days: state.days.filter((d) => daySet.has(d.date)),
    watchLogs: state.watchLogs.filter((w) => watchSet.has(watchKeyOf(w.lessonId, w.date))),
    freezeWeeks: dirty.freeze ? state.freezeWeeks : null,
    activePlanId: dirty.plans.length || dirty.full ? state.activePlanId : null,
    full: false,
  };
}

export function diffDirtyFrom(prev: PlannerState, next: PlannerState): Partial<DirtySet> {
  const plans: string[] = [];
  const tasks: string[] = [];
  const prevPlans = new Map(prev.plans.map((p) => [p.id, p]));
  for (const p of next.plans) {
    const before = prevPlans.get(p.id);
    if (!before || before.updatedAt !== p.updatedAt || before.active !== p.active || before.deletedAt !== p.deletedAt) {
      plans.push(p.id);
    }
    const beforeTasks = new Map((before?.tasks ?? []).map((t) => [t.id, t]));
    for (const t of p.tasks) {
      const bt = beforeTasks.get(t.id);
      if (!bt || bt.updatedAt !== t.updatedAt || bt.deletedAt !== t.deletedAt || bt.status !== t.status || bt.date !== t.date) {
        tasks.push(t.id);
      }
    }
  }
  const days = next.days
    .filter((d) => {
      const prevD = prev.days.find((x) => x.date === d.date);
      return !prevD || prevD.updatedAt !== d.updatedAt || prevD.minutesStudied !== d.minutesStudied;
    })
    .map((d) => d.date);
  const watch = next.watchLogs
    .filter((w) => {
      const prevW = prev.watchLogs.find((x) => x.lessonId === w.lessonId && x.date === w.date);
      return !prevW || prevW.updatedAt !== w.updatedAt || prevW.seconds !== w.seconds;
    })
    .map((w) => watchKeyOf(w.lessonId, w.date));
  const freeze = next.freezeWeeks.join() !== prev.freezeWeeks.join();
  return { plans, tasks, days, watch, freeze };
}
