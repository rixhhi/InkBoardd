/**
 * Pure rules for syncing a person's app data (plans, history, saved items,
 * preferences) between this browser's localStorage and their account.
 *
 * Each synced key keeps a small hash of the value both sides last agreed on
 * ("stamp"). On sign-in we compare: whichever side moved since the stamp wins.
 * If both moved, keys with a record-level merge (the planner) are merged per
 * plan/task/day (account-sync-merge.ts); any other key keeps this device's
 * value (it is the one the person is using now).
 */

import { mergeSynced } from "./account-sync-merge.ts";

/** Which account this browser's data belongs to. Never synced. */
export const OWNER_KEY = "inkboard.owner";
/** key → hash of the last value both sides agreed on. Never synced. */
export const STAMP_KEY = "inkboard.sync.v1";

/** Caches and device-bound data that stay on this device. */
const DEVICE_ONLY: readonly RegExp[] = [
  /^inkboard\.owner$/,
  /^inkboard\.sync\.v1$/,
  /^inkboard\.local\.v1$/,
  /^inkboard\.prepared\.v1$/,
  /^inkboard\.planner\.today-cache\.v1$/,
  /^inkboard\.planner\.dirty\.v1$/,
  /^inkboard\.offline\./,
  /^inkboard\.job-/,
];

export function isSyncedKey(key: string): boolean {
  return /^inkboard\.[A-Za-z0-9._-]{1,80}$/.test(key) && !DEVICE_ONLY.some((r) => r.test(key));
}

/** FNV-1a, 32-bit, plus the length. Tiny and good enough to spot a change. */
export function hashOf(value: string | null | undefined): string {
  if (value == null) return "-";
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}.${value.length.toString(36)}`;
}

export type RemoteState = Record<string, { value: string; updatedAt?: string }>;

export type Plan = {
  /** Values to write into localStorage (null = remove). */
  write: Record<string, string | null>;
  /** Values to send to the account (null = delete there). */
  push: { key: string; value: string | null }[];
  /** New stamps after both sides agree. */
  stamps: Record<string, string>;
};

/**
 * @param adopt true the first time this browser syncs with no owner recorded:
 *              the account wins where both sides have a value, and data that
 *              only exists here is uploaded.
 */
export function reconcile(input: {
  local: Record<string, string>;
  remote: RemoteState;
  stamps: Record<string, string>;
  adopt: boolean;
}): Plan {
  const { local, remote, stamps, adopt } = input;
  const plan: Plan = { write: {}, push: [], stamps: {} };
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)].filter(isSyncedKey));
  for (const key of keys) {
    const l = local[key] ?? null;
    const r = remote[key]?.value ?? null;
    if (l === r) {
      plan.stamps[key] = hashOf(l);
      continue;
    }
    if (l !== null && r !== null) {
      const was = stamps[key] ?? "-";
      const bothMoved = adopt || (hashOf(l) !== was && hashOf(r) !== was);
      const merged = bothMoved ? mergeSynced(key, l, r) : null;
      if (merged !== null) {
        if (merged !== l) plan.write[key] = merged;
        if (merged !== r) plan.push.push({ key, value: merged });
        plan.stamps[key] = hashOf(merged);
        continue;
      }
    }
    if (adopt) {
      if (r !== null) {
        plan.write[key] = r;
        plan.stamps[key] = hashOf(r);
      } else {
        plan.push.push({ key, value: l });
        plan.stamps[key] = hashOf(l);
      }
      continue;
    }
    const was = stamps[key] ?? "-";
    const localMoved = hashOf(l) !== was;
    const remoteMoved = hashOf(r) !== was;
    if (localMoved || !remoteMoved) {
      plan.push.push({ key, value: l });
      plan.stamps[key] = hashOf(l);
    } else {
      plan.write[key] = r;
      plan.stamps[key] = hashOf(r);
    }
  }
  return plan;
}
