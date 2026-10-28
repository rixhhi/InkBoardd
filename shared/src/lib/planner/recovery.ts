import { nowIso } from "./dates.ts";
import { uid } from "./ids.ts";
import { readPlanner, replaceState } from "./storage.ts";
import type { PlannerState } from "./types.ts";
import { readSessions, replaceSessions, type StudySession } from "./sessions.ts";
import { readJournal, replaceJournal, type JournalEntry } from "./journal.ts";
import { readEarnedBadges, replaceBadges, type EarnedBadge } from "./badges.ts";

export const RECOVERY_KEY = "inkboard.planner.recovery.v1";
export const MAX_RECOVERY = 3;

export type RecoveryPoint = {
  id: string;
  at: string;
  reason: string;
  planCount: number;
  taskCount: number;
  state: PlannerState;
  sessions?: StudySession[];
  journal?: JournalEntry[];
  badges?: EarnedBadge[];
};

function canStore() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readRaw(): RecoveryPoint[] {
  if (!canStore()) return [];
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecoveryPoint[];
    return Array.isArray(parsed) ? parsed.filter((p) => p?.id && p.state) : [];
  } catch {
    return [];
  }
}

export function listRecoveryPoints(): RecoveryPoint[] {
  return readRaw();
}

export function createRecoveryPoint(reason: string, state: PlannerState = readPlanner()): boolean {
  const point: RecoveryPoint = {
    id: uid("rp"),
    at: nowIso(),
    reason,
    planCount: state.plans.filter((p) => !p.deletedAt).length,
    taskCount: state.plans.reduce((n, p) => n + p.tasks.filter((t) => !t.deletedAt).length, 0),
    state,
    sessions: readSessions(),
    journal: readJournal(),
    badges: readEarnedBadges(),
  };
  const next = [point, ...readRaw()].slice(0, MAX_RECOVERY);
  if (!canStore()) return false;
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function restoreRecoveryPoint(id: string): boolean {
  const hit = readRaw().find((p) => p.id === id);
  if (!hit) return false;
  if (!createRecoveryPoint("before restore")) return false;
  replaceState(hit.state);
  if (hit.sessions) replaceSessions(hit.sessions);
  if (hit.journal) replaceJournal(hit.journal);
  if (hit.badges) replaceBadges(hit.badges);
  return true;
}

export function guardDestructive(reason: string): void {
  if (!createRecoveryPoint(reason)) {
    throw new Error("Could not write a recovery point. Export a backup before continuing.");
  }
}
