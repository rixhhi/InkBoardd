import { useCallback, useContext, useMemo, useRef, useSyncExternalStore } from "react";
import { PlannerSyncContext } from "./sync-context.ts";
import { nowDate, todayKey } from "./dates.ts";
import { useTodayKey } from "./use-today-key.ts";
import { computeStreaks, streakAtRisk } from "./streaks.ts";
import {
  activePlan,
  getServerPlanner,
  overdueTasks,
  plannerQuotaError,
  readPlanner,
  subscribePlanner,
  todaysTasks,
} from "./storage.ts";
import type { PlannerState } from "./types.ts";

export function usePlannerSnapshot() {
  return useSyncExternalStore(subscribePlanner, readPlanner, getServerPlanner);
}

export function usePlannerSelector<T>(select: (state: PlannerState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  const selectRef = useRef(select);
  selectRef.current = select;
  const equalRef = useRef(isEqual);
  equalRef.current = isEqual;
  const valueRef = useRef<T | undefined>(undefined);
  const serverRef = useRef<T | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const next = selectRef.current(readPlanner());
    if (valueRef.current !== undefined && equalRef.current(valueRef.current, next)) return valueRef.current;
    valueRef.current = next;
    return next;
  }, []);
  const getServer = useCallback(() => {
    const next = selectRef.current(getServerPlanner());
    if (serverRef.current !== undefined && equalRef.current(serverRef.current, next)) return serverRef.current;
    serverRef.current = next;
    return next;
  }, []);
  return useSyncExternalStore(subscribePlanner, getSnapshot, getServer);
}

export function usePlannerSync() {
  return useContext(PlannerSyncContext);
}

export function usePlannerTodayProgress() {
  return usePlannerSelector((state) => {
    const plan = activePlan(state);
    const today = todaysTasks(state);
    const done = today.filter((t) => t.status === "done").length;
    return { done, total: today.length, streak: computeStreaks(state.days, plan?.tasks ?? [], state.freezeWeeks, todayKey(), plan?.prefs.streakMinutes ?? 20, plan?.prefs).current };
  }, (a, b) => a.done === b.done && a.total === b.total && a.streak === b.streak);
}

export function usePlanner() {
  const state = usePlannerSnapshot();
  const { sync, retrySync, lastSyncedAt } = usePlannerSync();
  const date = useTodayKey();
  const plan = activePlan(state);
  const today = todaysTasks(state, date);
  const overdue = overdueTasks(state, date);
  const streak = useMemo(
    () =>
      computeStreaks(
        state.days,
        plan?.tasks ?? [],
        state.freezeWeeks,
        date,
        plan?.prefs.streakMinutes ?? 20,
        plan?.prefs,
      ),
    [state.days, plan, state.freezeWeeks, date],
  );
  const atRisk = plan ? streakAtRisk(plan.prefs, date, state.days, plan.tasks, nowDate()) : false;

  return {
    state,
    plan,
    today,
    overdue,
    streak,
    user: null,
    authPending: false,
    sync,
    retrySync,
    lastSyncedAt,
    quotaError: plannerQuotaError(),
    atRisk,
    savedByFreeze: streak.savedByFreeze,
    freezeLeft: streak.freezeLeftThisWeek,
    date,
  };
}

export function snapshotPlanner() {
  return readPlanner();
}
