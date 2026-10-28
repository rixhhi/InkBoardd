import { z } from "zod";
import { importState, readPlanner, replaceState, snapshotUndo } from "./storage.ts";
import { BACKUP_VERSION, EMPTY_STATE, type PlannerState } from "./types.ts";
import { guardDestructive } from "./recovery.ts";
import { importSessions, readSessions, type StudySession } from "./sessions.ts";
import { importJournal, readJournal, type JournalEntry } from "./journal.ts";
import { importBadges, readEarnedBadges, type EarnedBadge } from "./badges.ts";

const TaskSchema = z.object({
  id: z.string(),
  date: z.string(),
  orderIdx: z.number(),
  type: z.enum(["lesson", "revision", "dpp", "custom"]),
  lessonId: z.string().nullable(),
  courseId: z.string().nullable(),
  title: z.string(),
  teacher: z.string(),
  durationMin: z.number(),
  status: z.enum(["pending", "done", "skipped"]),
  completedAt: z.string().nullable(),
  rescheduledCount: z.number(),
  notesUrl: z.string().nullable().optional(),
  dppUrl: z.string().nullable().optional(),
  minutesLogged: z.number().optional(),
  updatedAt: z.string().optional(),
  deletedAt: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  refLessonIds: z.array(z.string()).optional(),
  subject: z.string().optional(),
  plannedDate: z.string().optional(),
});

const PlannerSchema = z.object({
  version: z.number().optional(),
  plans: z.array(z.unknown()),
  activePlanId: z.string().nullable(),
  days: z.array(z.unknown()).optional(),
  freezeWeeks: z.array(z.string()).optional(),
  watchLogs: z.array(z.unknown()).optional(),
});

const BackupFileSchema = z.object({
  backupVersion: z.number().optional(),
  version: z.number().optional(),
  planner: PlannerSchema.optional(),
  plans: z.array(z.unknown()).optional(),
  activePlanId: z.string().nullable().optional(),
  days: z.array(z.unknown()).optional(),
  freezeWeeks: z.array(z.string()).optional(),
  watchLogs: z.array(z.unknown()).optional(),
  sessions: z.array(z.unknown()).optional(),
  journal: z.array(z.unknown()).optional(),
  badges: z.array(z.unknown()).optional(),
  exportedAt: z.string().optional(),
});

export type BackupSummary = {
  plans: number;
  tasks: number;
  days: number;
  sessions: number;
  journal: number;
  badges: number;
  name: string;
};

export type PlannerBackup = {
  backupVersion: number;
  planner: PlannerState;
  sessions: StudySession[];
  journal: JournalEntry[];
  badges: EarnedBadge[];
  exportedAt: string;
};

function asPlanner(parsed: z.infer<typeof BackupFileSchema>): PlannerState {
  const src = parsed.planner ?? parsed;
  const plans = (src.plans ?? parsed.plans ?? []) as PlannerState["plans"];
  for (const p of plans) {
    if (p && Array.isArray((p as { tasks?: unknown }).tasks)) {
      for (const t of (p as { tasks: unknown[] }).tasks) TaskSchema.parse(t);
    }
  }
  return {
    version: 3,
    plans,
    activePlanId: src.activePlanId ?? parsed.activePlanId ?? null,
    days: ((src.days ?? parsed.days) as PlannerState["days"]) ?? [],
    freezeWeeks: src.freezeWeeks ?? parsed.freezeWeeks ?? [],
    watchLogs: ((src.watchLogs ?? parsed.watchLogs) as PlannerState["watchLogs"]) ?? [],
  };
}

export function backupSummary(state: PlannerState = readPlanner()): BackupSummary {
  const live = state.plans.filter((p) => !p.deletedAt);
  return {
    plans: live.length,
    tasks: live.reduce((n, p) => n + p.tasks.filter((t) => !t.deletedAt).length, 0),
    days: state.days.length,
    sessions: readSessions().filter((s) => !s.deletedAt).length,
    journal: readJournal().filter((e) => !e.deletedAt).length,
    badges: readEarnedBadges().filter((b) => !b.deletedAt).length,
    name: live.find((p) => p.id === state.activePlanId)?.name || live[0]?.name || "No plan",
  };
}

const PLANNER_PREFIX = "inkboard.planner.";

export function plannerStorageBytes(): number {
  try {
    if (typeof localStorage === "undefined") return 0;
    let n = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PLANNER_PREFIX)) continue;
      n += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    return n;
  } catch {
    return 0;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function exportPlannerJson(state: PlannerState = readPlanner()): string {
  const file: PlannerBackup = {
    backupVersion: BACKUP_VERSION,
    planner: state,
    sessions: readSessions(),
    journal: readJournal(),
    badges: readEarnedBadges(),
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(file, null, 2);
}

export function parsePlannerBackup(raw: string): PlannerState {
  const parsed = BackupFileSchema.parse(JSON.parse(raw));
  return asPlanner(parsed);
}

export function dryRunImport(raw: string): BackupSummary {
  const parsed = BackupFileSchema.parse(JSON.parse(raw));
  const planner = asPlanner(parsed);
  const live = planner.plans.filter((p) => !p.deletedAt);
  return {
    plans: live.length,
    tasks: live.reduce((n, p) => n + p.tasks.filter((t) => !t.deletedAt).length, 0),
    days: planner.days.length,
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions.length : 0,
    journal: Array.isArray(parsed.journal) ? parsed.journal.length : 0,
    badges: Array.isArray(parsed.badges) ? parsed.badges.length : 0,
    name: live[0]?.name || "Imported plan",
  };
}

export function importPlannerBackup(raw: string, mode: "merge" | "replace"): PlannerState {
  const parsed = BackupFileSchema.parse(JSON.parse(raw));
  const planner = asPlanner(parsed);
  guardDestructive("import backup");
  snapshotUndo();
  if (mode === "replace") replaceState(planner);
  else importState(planner);
  if (parsed.sessions) importSessions(parsed.sessions as StudySession[]);
  if (parsed.journal) importJournal(parsed.journal as JournalEntry[]);
  if (parsed.badges) importBadges(parsed.badges as EarnedBadge[]);
  return readPlanner();
}

export { EMPTY_STATE };
