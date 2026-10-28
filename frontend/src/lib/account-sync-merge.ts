/**
 * Record-level merge for synced values that both this device and the account
 * changed since they last agreed. Without it the whole value from one side
 * would win and the other side's edits would be lost.
 *
 * Planner (`inkboard.planner.v1`): plans, tasks and day logs each carry an id
 * (or date) plus `updatedAt`; deletes are tombstones (`deletedAt` + a fresh
 * `updatedAt`). For each record the newer copy wins, so a task ticked on the
 * phone and a different task moved on the laptop both survive. Ties keep this
 * device's copy. The active plan stays as chosen on this device.
 */

type Rec = { updatedAt?: unknown; [k: string]: unknown };

const MERGERS: Record<string, (local: unknown, remote: unknown) => unknown> = {
  "inkboard.planner.v1": mergePlannerState,
};

/** True when conflicting edits to this key can be merged record by record. */
export function hasMergeRule(key: string): boolean {
  return key in MERGERS;
}

/** Returns the merged JSON string, or null when the key has no merge rule or either side is unreadable. */
export function mergeSynced(key: string, local: string, remote: string): string | null {
  const merge = MERGERS[key];
  if (!merge) return null;
  let l: unknown;
  let r: unknown;
  try {
    l = JSON.parse(local);
    r = JSON.parse(remote);
  } catch {
    return null;
  }
  if (!isObj(l) || !isObj(r)) return null;
  return JSON.stringify(merge(l, r));
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stamp(r: Rec): number {
  const t = typeof r.updatedAt === "string" ? Date.parse(r.updatedAt) : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** Union of two record lists by key; newer `updatedAt` wins, ties keep local. Local order first. */
export function mergeRecords<T extends Rec>(local: T[], remote: T[], keyOf: (r: T) => unknown, pick = (l: T, r: T) => (stamp(r) > stamp(l) ? r : l)): T[] {
  const out = new Map<unknown, T>();
  for (const l of local) out.set(keyOf(l), l);
  for (const r of remote) {
    const k = keyOf(r);
    const l = out.get(k);
    out.set(k, l ? pick(l, r) : r);
  }
  return [...out.values()];
}

function list(v: unknown): Rec[] {
  return Array.isArray(v) ? v.filter(isObj) : [];
}

function mergePlannerState(local: unknown, remote: unknown): unknown {
  const l = local as Record<string, unknown>;
  const r = remote as Record<string, unknown>;
  const plans = mergeRecords(list(l.plans), list(r.plans), (p) => p.id, (lp, rp) => {
    const base = stamp(rp) > stamp(lp) ? rp : lp;
    const tasks = mergeRecords(list(lp.tasks), list(rp.tasks), (t) => t.id);
    return { ...base, tasks };
  });
  const days = mergeRecords(list(l.days), list(r.days), (d) => d.date);
  const weeks = [...new Set([...(Array.isArray(l.freezeWeeks) ? l.freezeWeeks : []), ...(Array.isArray(r.freezeWeeks) ? r.freezeWeeks : [])])];
  const live = plans.filter((p) => !p.deletedAt);
  const activePlanId = [l.activePlanId, r.activePlanId].find((id) => typeof id === "string" && live.some((p) => p.id === id)) ?? live[0]?.id ?? null;
  return { ...r, ...l, plans, days, freezeWeeks: weeks, activePlanId };
}
