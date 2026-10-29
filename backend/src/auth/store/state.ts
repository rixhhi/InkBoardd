import { inkItems, type InkItem } from "@inkboard/shared/planner/ink";
import type { StudyPlan, WatchLog } from "@inkboard/shared/planner/types";
import { one, q, store } from "./connection.ts";
import { statsTz } from "./types.ts";
import { iso, n } from "./util.ts";

/* ---------------- per-user app state ---------------- */

export const STATE_KEY = /^inkboard\.[A-Za-z0-9._-]{1,80}$/;
const STATE_MAX_VALUE = 600_000;
const STATE_MAX_TOTAL = 4_000_000;

export async function getUserState(userId: number): Promise<Record<string, { value: string; updatedAt: string }>> {
  const rows = await q<{ key: string; value: string; updated_at: unknown }>("select key, value, updated_at from ib_user_state where user_id = $1", [userId]);
  return Object.fromEntries(rows.map((r) => [r.key, { value: r.value, updatedAt: iso(r.updated_at) }]));
}

/** Same FNV-1a + length hash the browser uses for its sync stamps (frontend/src/lib/account-sync-core.ts). */
export function stateHash(value: string | null | undefined): string {
  if (value == null) return "-";
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}.${value.length.toString(36)}`;
}

export type StateEntry = { key: string; value: string | null; base?: string };

/**
 * Upsert synced keys; `null` deletes. An entry with `base` is compare-and-set:
 * it is only written if the stored value still hashes to `base`; otherwise it
 * comes back in `conflicts` with the current value so the device can merge.
 */
export async function putUserState(userId: number, entries: StateEntry[]): Promise<{ savedAt: string; rejected: string[]; conflicts: { key: string; value: string | null }[] }> {
  const rejected: string[] = [];
  const conflicts: { key: string; value: string | null }[] = [];
  const ok = entries.filter((e) => {
    const good = STATE_KEY.test(e.key) && (e.value === null || (typeof e.value === "string" && e.value.length <= STATE_MAX_VALUE));
    if (!good) rejected.push(e.key);
    return good;
  });
  const savedAt = new Date().toISOString();
  if (!ok.length) return { savedAt, rejected, conflicts };
  await (await store()).tx(async (t) => {
    for (const e of ok) {
      if (typeof e.base === "string") {
        const cur = await t("select value from ib_user_state where user_id = $1 and key = $2 for update", [userId, e.key]);
        const value = (cur[0]?.value as string | undefined) ?? null;
        if (stateHash(value) !== e.base) {
          conflicts.push({ key: e.key, value });
          continue;
        }
      }
      if (e.value === null) await t("delete from ib_user_state where user_id = $1 and key = $2", [userId, e.key]);
      else await t("insert into ib_user_state (user_id, key, value, updated_at) values ($1, $2, $3, $4) on conflict (user_id, key) do update set value = excluded.value, updated_at = excluded.updated_at", [userId, e.key, e.value, savedAt]);
    }
    const total = await t("select coalesce(sum(length(value)), 0) as n from ib_user_state where user_id = $1", [userId]);
    if (n(total[0]?.n) > STATE_MAX_TOTAL) throw new Error("STATE_TOO_LARGE");
  });
  return { savedAt, rejected, conflicts };
}

export type PlannerSummary = {
  planName: string;
  examName: string;
  tasksTotal: number;
  tasksDone: number;
  todayTotal: number;
  todayDone: number;
  minutes7d: number;
  updatedAt: string;
  /** Exam day from the plan, for the ink scrubber. */
  examDate: string | null;
  /** Fading Ink items, the same math the member sees. Capped so the admin payload stays small. */
  ink: InkItem[];
} | null;

const INK_CAP = 400;

/** A member's active study plan, read from their synced planner state. */
export async function plannerSummary(userId: number): Promise<PlannerSummary> {
  const row = await one<{ value: string; updated_at: unknown }>("select value, updated_at from ib_user_state where user_id = $1 and key = 'inkboard.planner.v1'", [userId]);
  if (!row) return null;
  try {
    const state = JSON.parse(row.value) as {
      activePlanId?: string | null;
      plans?: (Partial<StudyPlan> & { id: string })[];
      days?: { date?: string; minutesStudied?: number }[];
      watchLogs?: WatchLog[];
    };
    const plan = (state.plans ?? []).find((p) => p.id === state.activePlanId && !p.deletedAt) ?? (state.plans ?? []).find((p) => !p.deletedAt);
    if (!plan) return null;
    const tasks = plan.tasks ?? [];
    let ink: InkItem[] = [];
    try {
      // Tolerate partial plans from older clients: inkItems only needs courses, tasks, reviews and prefs.
      ink = inkItems({ ...plan, courses: plan.courses ?? [], tasks, reviews: plan.reviews ?? [], prefs: plan.prefs ?? ({} as StudyPlan["prefs"]) } as StudyPlan, state.watchLogs ?? []).slice(0, INK_CAP);
    } catch {
      ink = [];
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: statsTz() }).format(new Date());
    const weekAgo = new Intl.DateTimeFormat("en-CA", { timeZone: statsTz() }).format(new Date(Date.now() - 6 * 86_400_000));
    const done = (t: { status?: string }) => t.status === "done";
    return {
      planName: plan.name || "Study plan",
      examName: plan.examName || "",
      tasksTotal: tasks.length,
      tasksDone: tasks.filter(done).length,
      todayTotal: tasks.filter((t) => t.date === today).length,
      todayDone: tasks.filter((t) => t.date === today && done(t)).length,
      minutes7d: (state.days ?? []).filter((d) => (d.date ?? "") >= weekAgo).reduce((s, d) => s + (d.minutesStudied ?? 0), 0),
      updatedAt: iso(row.updated_at),
      examDate: plan.prefs?.examDate ?? null,
      ink,
    };
  } catch {
    return null;
  }
}
