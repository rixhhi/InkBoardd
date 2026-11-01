/**
 * Keeps this browser's app data (plans, history, saved, preferences) in the
 * signed-in person's account, so it follows them to any device and never leaks
 * to the next person who signs in here.
 *
 *   sign-in  → pull the account copy, reconcile (account-sync-core.ts), and
 *              reload once if anything on screen changed
 *   while on → every 15 s, push keys whose value moved since the last sync
 *   tab hide → push straight away (keepalive)
 *   online   → push straight away (edits made offline were queued in localStorage)
 *   sign-out → push, then wipe synced keys from this browser
 */
import { apiJson } from "@/lib/api-client";
import { OWNER_KEY, STAMP_KEY, hashOf, isSyncedKey, reconcile, type RemoteState } from "@/lib/account-sync-core";
import { hasMergeRule, mergeSynced } from "@/lib/account-sync-merge";
import { notifyPlannerChanged } from "@inkboard/shared/planner/storage";

const PUSH_EVERY_MS = 15_000;
/**
 * Per-request budget in UTF-8 *bytes*, not characters. The API accepts 2 MB on
 * PUT /api/me/state; staying well under leaves room for JSON escaping. A value
 * with Hindi text is up to 3 bytes per character, which is why chars were the
 * wrong unit before.
 */
const MAX_BATCH_BYTES = 1_200_000;

const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

/** UTF-8 size of an entry as it will appear in the request body (approximate, always ≥ real for ASCII). */
export function entryBytes(e: { key: string; value: string | null }): number {
  const text = e.key + (e.value ?? "");
  const raw = encoder ? encoder.encode(text).length : text.length * 3;
  // Quotes, commas, the "base" stamp and JSON escapes for quotes/newlines.
  return raw + 64;
}

type Status = "idle" | "syncing" | "synced" | "offline" | "error";
let status: Status = "idle";
let lastSyncedAt: string | null = null;
const listeners = new Set<() => void>();
let timer: number | null = null;
let activeUser: number | null = null;
let pushing: Promise<void> | null = null;

function setStatus(next: Status) {
  status = next;
  if (next === "synced") lastSyncedAt = new Date().toISOString();
  for (const fn of listeners) fn();
}

export function syncStatus() {
  return { status, lastSyncedAt };
}

export function subscribeSync(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readLocal(): Record<string, string> {
  const store = ls();
  const out: Record<string, string> = {};
  if (!store) return out;
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || !isSyncedKey(key)) continue;
    const value = store.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

function readStamps(): Record<string, string> {
  try {
    const raw = JSON.parse(ls()?.getItem(STAMP_KEY) || "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeStamps(stamps: Record<string, string>) {
  try {
    ls()?.setItem(STAMP_KEY, JSON.stringify(stamps));
  } catch {
    /* quota: next sync re-checks */
  }
}

/** Remove every synced key (another person is signing in, or this one signed out). */
export function wipeLocalAccountData() {
  const store = ls();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && (isSyncedKey(key) || key === STAMP_KEY || key === OWNER_KEY)) keys.push(key);
  }
  for (const k of keys) store.removeItem(k);
}

export function batches<T extends { key: string; value: string | null }>(entries: T[], limit = MAX_BATCH_BYTES) {
  const out: T[][] = [];
  let cur: T[] = [];
  let size = 0;
  for (const e of entries) {
    const n = entryBytes(e);
    if (cur.length && size + n > limit) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(e);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

type Entry = { key: string; value: string | null; base?: string };
type Conflict = { key: string; value: string | null };

async function send(entries: Entry[], keepalive = false): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];
  for (const batch of batches(entries)) {
    const res = await apiJson<{ conflicts?: Conflict[] }>("/api/me/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries: batch }),
      credentials: "same-origin",
      keepalive: keepalive && JSON.stringify(batch).length < 60_000,
    });
    if (Array.isArray(res?.conflicts)) conflicts.push(...res.conflicts);
  }
  return conflicts;
}

/**
 * Keys whose value changed since the last agreed stamp. Keys with a merge rule
 * carry `base` (the stamp) so the server refuses the write if another device
 * got there first, and we merge instead of overwriting their edits.
 */
function changedSinceStamp(): Entry[] {
  const local = readLocal();
  const stamps = readStamps();
  const out: Entry[] = [];
  for (const [key, value] of Object.entries(local)) {
    if (stamps[key] === hashOf(value)) continue;
    out.push(hasMergeRule(key) ? { key, value, base: stamps[key] ?? "-" } : { key, value });
  }
  for (const key of Object.keys(stamps)) if (!(key in local) && stamps[key] !== "-" && isSyncedKey(key)) out.push({ key, value: null });
  return out;
}

export function pushNow(keepalive = false): Promise<void> {
  if (activeUser == null) return Promise.resolve();
  if (pushing) return pushing;
  const changes = changedSinceStamp();
  if (!changes.length) return Promise.resolve();
  pushing = (async () => {
    setStatus("syncing");
    try {
      const conflicts = await send(changes, keepalive);
      const lost = new Set(conflicts.map((c) => c.key));
      const stamps = readStamps();
      for (const c of changes) {
        if (lost.has(c.key)) continue;
        if (c.value === null) delete stamps[c.key];
        else stamps[c.key] = hashOf(c.value);
      }
      writeStamps(stamps);
      if (conflicts.length) await settleConflicts(conflicts);
      setStatus("synced");
    } catch {
      setStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error");
    } finally {
      pushing = null;
    }
  })();
  return pushing;
}

/**
 * Another device saved first. Merge their copy with ours record by record,
 * keep the result here and send it back on top of their version. If yet
 * another write slips in between, the next tick tries again.
 */
async function settleConflicts(conflicts: Conflict[]) {
  const store = ls();
  if (!store) return;
  const retry: Entry[] = [];
  const stamps = readStamps();
  for (const c of conflicts) {
    const mine = store.getItem(c.key);
    if (mine === null || c.value === null) continue;
    const merged = mergeSynced(c.key, mine, c.value) ?? mine;
    if (merged !== mine) {
      try {
        store.setItem(c.key, merged);
        notifyPlannerChanged();
      } catch {
        continue;
      }
    }
    if (merged === c.value) stamps[c.key] = hashOf(merged);
    else retry.push({ key: c.key, value: merged, base: hashOf(c.value) });
  }
  writeStamps(stamps);
  if (!retry.length) return;
  const again = new Set((await send(retry)).map((c) => c.key));
  const next = readStamps();
  for (const r of retry) if (!again.has(r.key) && r.value !== null) next[r.key] = hashOf(r.value);
  writeStamps(next);
}

function onHide() {
  if (document.visibilityState === "hidden") void pushNow(true);
}

function stopLoop() {
  if (timer != null) window.clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", onHide);
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("online", onOnline);
}

function onOnline() {
  // Back from the train: push what changed while offline straight away.
  void pushNow();
}

function onPageHide() {
  void pushNow(true);
}

/**
 * Start syncing for this user. Returns true when local data was replaced and
 * the page should reload so every store re-reads it.
 */
export async function startAccountSync(userId: number): Promise<boolean> {
  if (typeof window === "undefined" || activeUser === userId) return false;
  stopLoop();
  activeUser = userId;
  const store = ls();
  if (!store) return false;

  const owner = store.getItem(OWNER_KEY);
  if (owner && owner !== String(userId)) wipeLocalAccountData();
  const adopt = !owner || owner !== String(userId);

  setStatus("syncing");
  let remote: RemoteState;
  try {
    remote = (await apiJson<{ state: RemoteState }>("/api/me/state", { credentials: "same-origin", cache: "no-store" })).state ?? {};
  } catch {
    // Offline: keep working locally; we'll try again on the next push tick.
    activeUser = owner === String(userId) ? userId : null;
    setStatus("offline");
    return false;
  }

  const plan = reconcile({ local: readLocal(), remote, stamps: adopt ? {} : readStamps(), adopt });
  const writes = Object.entries(plan.write);
  for (const [key, value] of writes) {
    try {
      if (value === null) store.removeItem(key);
      else store.setItem(key, value);
    } catch {
      /* quota: skip that key */
    }
  }
  try {
    if (plan.push.length) await send(plan.push);
    writeStamps(plan.stamps);
    store.setItem(OWNER_KEY, String(userId));
    setStatus("synced");
  } catch {
    setStatus("error");
  }

  timer = window.setInterval(() => void pushNow(), PUSH_EVERY_MS);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("online", onOnline);
  return writes.length > 0;
}

/** Push what's pending, then forget this person's data on this browser. */
export async function stopAccountSync() {
  if (typeof window === "undefined") return;
  try {
    await pushNow();
  } catch {
    /* best effort */
  }
  stopLoop();
  activeUser = null;
  wipeLocalAccountData();
  setStatus("idle");
}
