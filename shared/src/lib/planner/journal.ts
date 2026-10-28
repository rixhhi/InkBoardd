import { nowIso, todayKey } from "./dates.ts";
import { uid } from "./ids.ts";
import { markDirty } from "./dirty.ts";
import { mergeJournal } from "./extras.ts";

export const JOURNAL_KEY = "inkboard.planner.journal.v1";

export type JournalGoal = { id: string; text: string; done: boolean };

export type JournalEntry = {
  date: string;
  mood: number;
  focus: number;
  summary: string;
  wentWell: string;
  wentWrong: string;
  tomorrow: string;
  goals: JournalGoal[];
  updatedAt: string;
  deletedAt: string | null;
};

const listeners = new Set<() => void>();
let cache: JournalEntry[] | null = null;

function canStore(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function emit() {
  for (const cb of listeners) cb();
}

function readRaw(): JournalEntry[] {
  if (!canStore()) return [];
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JournalEntry[];
    return Array.isArray(parsed)
      ? parsed.filter((e) => e && typeof e.date === "string").map((e) => ({ ...e, deletedAt: e.deletedAt ?? null }))
      : [];
  } catch {
    return [];
  }
}

export const EMPTY_JOURNAL: JournalEntry[] = Object.freeze([]) as unknown as JournalEntry[];

export function getServerJournal(): JournalEntry[] {
  return EMPTY_JOURNAL;
}

export function subscribeJournal(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function readJournal(): JournalEntry[] {
  if (!cache) cache = readRaw();
  return cache;
}

export function writeJournal(next: JournalEntry[]) {
  cache = next;
  if (canStore()) {
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  }
  emit();
  return next;
}

export function emptyEntry(date = todayKey()): JournalEntry {
  return {
    date,
    mood: 3,
    focus: 3,
    summary: "",
    wentWell: "",
    wentWrong: "",
    tomorrow: "",
    goals: [],
    updatedAt: nowIso(),
    deletedAt: null,
  };
}

export function entryFor(date: string, list = readJournal()): JournalEntry | null {
  return list.find((e) => e.date === date) ?? null;
}

export function upsertJournal(over: Partial<JournalEntry> & { date: string }): JournalEntry {
  const list = readJournal();
  const prev = list.find((e) => e.date === over.date) ?? emptyEntry(over.date);
  const next: JournalEntry = { ...prev, ...over, updatedAt: nowIso(), deletedAt: over.deletedAt ?? null };
  markDirty({ journal: [next.date] });
  return writeJournal([next, ...list.filter((e) => e.date !== over.date)])[0]!;
}

export function addJournalGoal(date: string, text: string) {
  const cur = entryFor(date) ?? emptyEntry(date);
  return upsertJournal({
    ...cur,
    goals: [...cur.goals, { id: uid("g"), text, done: false }],
  });
}

export function toggleJournalGoal(date: string, id: string) {
  const cur = entryFor(date);
  if (!cur) return null;
  return upsertJournal({
    ...cur,
    goals: cur.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)),
  });
}

export function journalStreak(list = readJournal(), today = todayKey()): number {
  const set = new Set(
    list.filter((e) => !e.deletedAt && (e.summary.trim() || e.wentWell.trim())).map((e) => e.date),
  );
  let n = 0;
  let cursor = today;
  while (set.has(cursor)) {
    n += 1;
    const parts = cursor.split("-").map(Number);
    const y = parts[0] ?? 0;
    const m = parts[1] ?? 1;
    const d = parts[2] ?? 1;
    const dt = new Date(y, m - 1, d - 1);
    cursor = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  return n;
}

export function replaceJournal(next: JournalEntry[]) {
  cache = next;
  if (canStore()) {
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  }
  emit();
  return next;
}

export function importJournal(incoming: JournalEntry[]) {
  return replaceJournal(mergeJournal(readJournal(), incoming));
}

export function resetJournal() {
  cache = [];
  if (canStore()) {
    try {
      localStorage.removeItem(JOURNAL_KEY);
    } catch {
      /* ignore */
    }
  }
  emit();
}

