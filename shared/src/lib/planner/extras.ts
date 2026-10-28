import { compareIso, maxIso } from "./dates.ts";
import { EPOCH_ISO } from "./types.ts";
import type { JournalEntry } from "./journal.ts";
import type { EarnedBadge } from "./badges.ts";
import type { StudySession } from "./sessions.ts";

function touch(updatedAt?: string | null, deletedAt?: string | null): string {
  return maxIso(updatedAt, deletedAt) || EPOCH_ISO;
}

export function mergeById<T extends { id: string; updatedAt: string; deletedAt?: string | null }>(
  a: T[],
  b: T[],
): T[] {
  const map = new Map<string, T>();
  for (const row of [...a, ...b]) {
    const cur = map.get(row.id);
    if (!cur || compareIso(touch(row.updatedAt, row.deletedAt), touch(cur.updatedAt, cur.deletedAt)) > 0) {
      map.set(row.id, row);
    }
  }
  return [...map.values()];
}

export function mergeSessions(a: StudySession[], b: StudySession[]): StudySession[] {
  return mergeById(a, b).sort((x, y) => y.startIso.localeCompare(x.startIso));
}

export function mergeJournal(a: JournalEntry[], b: JournalEntry[]): JournalEntry[] {
  const map = new Map<string, JournalEntry>();
  for (const row of [...a, ...b]) {
    const cur = map.get(row.date);
    if (!cur || compareIso(touch(row.updatedAt, row.deletedAt), touch(cur.updatedAt, cur.deletedAt)) > 0) {
      map.set(row.date, row);
    }
  }
  return [...map.values()].sort((x, y) => y.date.localeCompare(x.date));
}

export function mergeBadges(a: EarnedBadge[], b: EarnedBadge[]): EarnedBadge[] {
  return mergeById(a, b);
}

export function liveExtras<T extends { deletedAt?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt);
}
