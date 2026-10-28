import { nowDate, nowIso, todayKey } from "./dates.ts";
import { uid } from "./ids.ts";
import { markDirty } from "./dirty.ts";

export type SessionSource = "watch" | "manual" | "focus";

export type StudySession = {
  id: string;
  date: string;
  startIso: string;
  durationMin: number;
  subject: string;
  courseId: string | null;
  taskId: string | null;
  lessonId: string | null;
  notes: string;
  source: SessionSource;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export const SESSIONS_KEY = "inkboard.planner.sessions.v1";

export type ManualLogInput = {
  startIso: string;
  durationMin: number;
  subject?: string;
  courseId?: string | null;
  taskId?: string | null;
  lessonId?: string | null;
  notes?: string;
};

export function sessionEndIso(startIso: string, durationMin: number): string {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return startIso;
  return new Date(start + durationMin * 60_000).toISOString();
}

export function sessionsOverlap(aStart: string, aMin: number, bStart: string, bMin: number): boolean {
  const a0 = Date.parse(aStart);
  const b0 = Date.parse(bStart);
  if (!Number.isFinite(a0) || !Number.isFinite(b0)) return false;
  const a1 = a0 + aMin * 60_000;
  const b1 = b0 + bMin * 60_000;
  return a0 < b1 && b0 < a1;
}

export function validateManualLog(
  input: ManualLogInput,
  existing: StudySession[],
  now: Date = nowDate(),
): { ok: true; session: StudySession } | { ok: false; error: string } {
  const durationMin = Math.round(Number(input.durationMin));
  if (!Number.isFinite(durationMin) || durationMin < 1 || durationMin > 720) {
    return { ok: false, error: "Duration must be 1–720 minutes." };
  }
  const start = Date.parse(input.startIso);
  if (!Number.isFinite(start)) return { ok: false, error: "Pick a start time." };
  if (start > now.getTime() + 60_000) return { ok: false, error: "Can’t log study in the future." };
  const live = existing.filter((s) => !s.deletedAt);
  if (live.some((s) => sessionsOverlap(s.startIso, s.durationMin, input.startIso, durationMin))) {
    return { ok: false, error: "That overlaps another session." };
  }
  const at = nowIso(now);
  const date = todayKey(new Date(start));
  return {
    ok: true,
    session: {
      id: uid("ses"),
      date,
      startIso: new Date(start).toISOString(),
      durationMin,
      subject: (input.subject ?? "").trim(),
      courseId: input.courseId ?? null,
      taskId: input.taskId ?? null,
      lessonId: input.lessonId ?? null,
      notes: (input.notes ?? "").trim(),
      source: "manual",
      completed: true,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    },
  };
}

function canStore(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

let cache: StudySession[] | null = null;
let liveCache: StudySession[] | null = null;
let liveFrom: StudySession[] | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

export const EMPTY_SESSIONS: StudySession[] = Object.freeze([]) as unknown as StudySession[];

export function getServerSessions(): StudySession[] {
  return EMPTY_SESSIONS;
}

export function subscribeSessions(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function readRaw(): StudySession[] {
  if (!canStore()) return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StudySession[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s.id === "string" && typeof s.date === "string");
  } catch {
    return [];
  }
}

export function readSessions(): StudySession[] {
  if (!cache) cache = readRaw();
  return cache;
}

export function writeSessions(next: StudySession[]) {
  cache = next;
  liveCache = null;
  liveFrom = null;
  if (canStore()) {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  }
  emit();
  return next;
}

export function addSession(session: StudySession): StudySession[] {
  markDirty({ sessions: [session.id] });
  return writeSessions([session, ...readSessions().filter((s) => s.id !== session.id)]);
}

export function patchSession(id: string, over: Partial<StudySession>): StudySession[] {
  const at = nowIso();
  markDirty({ sessions: [id] });
  return writeSessions(readSessions().map((s) => (s.id === id ? { ...s, ...over, updatedAt: at } : s)));
}

export function deleteSession(id: string): StudySession | null {
  const hit = readSessions().find((s) => s.id === id);
  if (!hit) return null;
  const at = nowIso();
  markDirty({ sessions: [id] });
  writeSessions(readSessions().map((s) => (s.id === id ? { ...s, deletedAt: at, updatedAt: at } : s)));
  return hit;
}

export function restoreSession(session: StudySession) {
  return addSession({ ...session, deletedAt: null, updatedAt: nowIso() });
}

export function liveSessions(list?: StudySession[]): StudySession[] {
  const src = list ?? readSessions();
  if (list === undefined) {
    if (liveFrom === src && liveCache) return liveCache;
    liveFrom = src;
    liveCache = src.filter((s) => !s.deletedAt);
    return liveCache;
  }
  return src.filter((s) => !s.deletedAt);
}

export function recentSessions(n = 8, list: StudySession[] = readSessions()): StudySession[] {
  return liveSessions(list)
    .slice()
    .sort((a, b) => b.startIso.localeCompare(a.startIso))
    .slice(0, n);
}

export function replaceSessions(next: StudySession[]) {
  return writeSessions(next);
}

export function importSessions(incoming: StudySession[]) {
  const map = new Map(readSessions().map((s) => [s.id, s]));
  for (const row of incoming) {
    const cur = map.get(row.id);
    if (!cur || (row.updatedAt || "") > (cur.updatedAt || "")) map.set(row.id, row);
  }
  return writeSessions([...map.values()]);
}

export function resetSessions() {
  cache = [];
  liveCache = [];
  liveFrom = cache;
  if (canStore()) {
    try {
      localStorage.removeItem(SESSIONS_KEY);
    } catch {
      /* ignore */
    }
  }
  emit();
}

