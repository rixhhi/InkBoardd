import { useEffect, useMemo, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { todayKey } from "@inkboard/shared/planner/dates";
import { maybeNotify } from "@inkboard/shared/planner/reminders";
import { PlannerSyncContext } from "@inkboard/shared/planner/sync-context";
import type { SyncStatus } from "@inkboard/shared/planner/types";
import { pushNow, subscribeSync, syncStatus } from "@/lib/account-sync";

const SERVER_SYNC = { status: "idle" as const, lastSyncedAt: null };
let lastSnap = syncStatus();
function readSync() {
  const next = syncStatus();
  if (next.status !== lastSnap.status || next.lastSyncedAt !== lastSnap.lastSyncedAt) lastSnap = next;
  return lastSnap;
}

/** Account sync state in the planner's vocabulary. */
function plannerSyncStatus(s: ReturnType<typeof syncStatus>["status"]): SyncStatus {
  return s === "idle" ? "local-only" : s;
}
import { computeStreaks } from "@inkboard/shared/planner/streaks";
import {
  activePlan,
  getServerPlanner,
  mergeFreezeWeeks,
  readPlanner,
  subscribePlanner,
  todaysTasks,
} from "@inkboard/shared/planner/storage";

export function PlannerSyncProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribePlanner, readPlanner, getServerPlanner);
  const plan = activePlan(state);
  const today = todaysTasks(state);
  const streak = computeStreaks(
    state.days,
    plan?.tasks ?? [],
    state.freezeWeeks,
    todayKey(),
    plan?.prefs.streakMinutes ?? 20,
    plan?.prefs,
  );
  const pendingToday = today.filter((t) => t.status === "pending").length;
  const freezeKey = (streak.consumedWeeks ?? []).join(",");

  useEffect(() => {
    const missing = freezeKey.split(",").filter((w) => w && !state.freezeWeeks.includes(w));
    if (!missing.length) return;
    mergeFreezeWeeks(missing);
  }, [freezeKey, state.freezeWeeks]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `today` is a fresh array every store tick and `plan` a fresh object; the reminder must fire only when the plan id, the pending count or the reminder prefs change
  useEffect(() => {
    if (!plan) return;
    maybeNotify(plan.prefs, today);
  }, [plan?.id, pendingToday, plan?.prefs.reminders, plan?.prefs.timeSlot]);

  const account = useSyncExternalStore(subscribeSync, readSync, () => SERVER_SYNC);
  const value = useMemo(
    () => ({ sync: plannerSyncStatus(account.status), retrySync: () => void pushNow(), lastSyncedAt: account.lastSyncedAt }),
    [account.status, account.lastSyncedAt],
  );

  return <PlannerSyncContext.Provider value={value}>{children}</PlannerSyncContext.Provider>;
}
