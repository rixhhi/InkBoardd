
import { q } from "./connection.ts";
import { ACTIVITY_KEEP_MINUTES, type Activity, statsTz } from "./types.ts";
import { iso, isoOrNull, n } from "./util.ts";

/* ---------------- activity ---------------- */

const OPEN_KINDS = new Set(["lesson", "course", "teacher", "batch", "exam"]);

export async function logActivity(userId: number, entry: { kind: string; ref?: string; label?: string; path?: string; seconds?: number }) {
  const kind = entry.kind.slice(0, 32);
  const ref = (entry.ref || "").slice(0, 120);
  const label = (entry.label || "").slice(0, 200);
  const seconds = Math.max(0, Math.min(3600, Math.round(entry.seconds || 0)));
  const tz = statsTz();
  await q("insert into ib_activity (user_id, kind, ref, label, path, seconds) values ($1, $2, $3, $4, $5, $6)", [userId, kind, ref, label, (entry.path || "").slice(0, 300), seconds]);
  if (kind === "watch" && seconds > 0) {
    await q(
      `insert into ib_daily (user_id, day, watch_seconds) values ($1, (now() at time zone $3)::date, $2)
       on conflict (user_id, day) do update set watch_seconds = ib_daily.watch_seconds + excluded.watch_seconds`,
      [userId, seconds, tz],
    );
  } else if (OPEN_KINDS.has(kind)) {
    await q(
      `insert into ib_daily (user_id, day, opens) values ($1, (now() at time zone $2)::date, 1)
       on conflict (user_id, day) do update set opens = ib_daily.opens + 1`,
      [userId, tz],
    );
  }
  if ((kind === "watch" || kind === "lesson") && ref) {
    await q(
      `insert into ib_daily_lessons (user_id, day, ref, label, seconds) values ($1, (now() at time zone $5)::date, $2, $3, $4)
       on conflict (user_id, day, ref) do update
         set seconds = ib_daily_lessons.seconds + excluded.seconds,
             label = case when excluded.label <> '' then excluded.label else ib_daily_lessons.label end`,
      [userId, ref, label, kind === "watch" ? seconds : 0, tz],
    );
  }
}

type ActivityRow = { id: unknown; user_id: number; at: unknown; kind: string; ref: string; label: string; path: string; seconds: number };

/** Raw events from the last hour (older ones are deleted). */
export async function listActivity(filter: { userId?: number; limit?: number; before?: number; kind?: string } = {}): Promise<Activity[]> {
  const where = [`a.at > now() - interval '${ACTIVITY_KEEP_MINUTES} minutes'`];
  const args: unknown[] = [];
  if (filter.userId !== undefined) {
    args.push(filter.userId);
    where.push(`a.user_id = $${args.length}`);
  }
  if (filter.before !== undefined) {
    args.push(filter.before);
    where.push(`a.id < $${args.length}`);
  }
  if (filter.kind) {
    args.push(filter.kind);
    where.push(`a.kind = $${args.length}`);
  }
  const limit = Math.max(1, Math.min(500, filter.limit ?? 100));
  const rows = await q<ActivityRow>(`select a.* from ib_activity a where ${where.join(" and ")} order by a.id desc limit ${limit}`, args);
  return rows.map((r) => ({ id: n(r.id), userId: n(r.user_id), at: iso(r.at), kind: r.kind, ref: r.ref, label: r.label, path: r.path, seconds: n(r.seconds) }));
}

/** Who is active now: members with an event in the last 5 minutes, and what they were on. */
export async function onlineNow(): Promise<{ userId: number; at: string; kind: string; label: string; ref: string }[]> {
  const rows = await q<ActivityRow>(
    `select distinct on (a.user_id) a.* from ib_activity a join ib_users u on u.id = a.user_id
     where a.at > now() - interval '5 minutes' and u.role = 'member' order by a.user_id, a.id desc`,
  );
  return rows.map((r) => ({ userId: n(r.user_id), at: iso(r.at), kind: r.kind, label: r.label, ref: r.ref }));
}

export type MemberStats = {
  userId: number;
  watchSeconds7d: number;
  watchSeconds30d: number;
  lessons7d: number;
  activeDays30d: number;
  lastActivityAt: string | null;
};

export async function memberStats(userId?: number): Promise<MemberStats[]> {
  const tz = statsTz();
  const rows = await q<{ user_id: number; w7: unknown; w30: unknown; l7: unknown; d30: unknown; last_at: unknown }>(
    `with today as (select (now() at time zone $1)::date as d)
     select u.id as user_id,
       coalesce((select sum(watch_seconds) from ib_daily x, today where x.user_id = u.id and x.day > today.d - 7), 0) as w7,
       coalesce((select sum(watch_seconds) from ib_daily x, today where x.user_id = u.id and x.day > today.d - 30), 0) as w30,
       coalesce((select count(distinct ref) from ib_daily_lessons x, today where x.user_id = u.id and x.day > today.d - 7), 0) as l7,
       coalesce((select count(*) from ib_daily x, today where x.user_id = u.id and x.day > today.d - 30 and (x.watch_seconds > 0 or x.opens > 0)), 0) as d30,
       u.last_seen_at as last_at
     from ib_users u where u.role = 'member' ${userId !== undefined ? "and u.id = $2" : ""}`,
    userId !== undefined ? [tz, userId] : [tz],
  );
  return rows.map((r) => ({
    userId: n(r.user_id),
    watchSeconds7d: n(r.w7),
    watchSeconds30d: n(r.w30),
    lessons7d: n(r.l7),
    activeDays30d: n(r.d30),
    lastActivityAt: isoOrNull(r.last_at),
  }));
}

/** Seconds watched per day for the last N days (every day present, zeros included). */
export async function dailyWatch(days = 14, userId?: number): Promise<{ day: string; seconds: number }[]> {
  const rows = await q<{ day: unknown; s: unknown }>(
    `select to_char(d, 'YYYY-MM-DD') as day,
            coalesce((select sum(watch_seconds) from ib_daily x where x.day = d::date ${userId !== undefined ? "and x.user_id = $3" : ""}), 0) as s
     from generate_series((now() at time zone $1)::date - ($2::int - 1), (now() at time zone $1)::date, interval '1 day') as d
     order by d`,
    userId !== undefined ? [statsTz(), days, userId] : [statsTz(), days],
  );
  return rows.map((r) => ({ day: String(r.day), seconds: n(r.s) }));
}

export async function topLessons(days = 30, limit = 10): Promise<{ ref: string; label: string; members: number; seconds: number }[]> {
  const rows = await q<{ ref: string; label: string; members: unknown; seconds: unknown }>(
    `select ref, max(label) as label, count(distinct user_id) as members, sum(seconds) as seconds from ib_daily_lessons
     where day > (now() at time zone $1)::date - $2::int group by ref order by sum(seconds) desc, count(distinct user_id) desc limit $3`,
    [statsTz(), days, limit],
  );
  return rows.map((r) => ({ ref: r.ref, label: r.label, members: n(r.members), seconds: n(r.seconds) }));
}

/** A member's classes over the last N days, newest first (survives the 1-hour raw log). */
export async function recentLessons(userId: number, days = 30, limit = 40): Promise<{ ref: string; label: string; seconds: number; lastDay: string }[]> {
  const rows = await q<{ ref: string; label: string; seconds: unknown; last_day: unknown }>(
    `select ref, max(label) as label, sum(seconds) as seconds, to_char(max(day), 'YYYY-MM-DD') as last_day from ib_daily_lessons
     where user_id = $1 and day > (now() at time zone $2)::date - $3::int group by ref order by max(day) desc, sum(seconds) desc limit $4`,
    [userId, statsTz(), days, limit],
  );
  return rows.map((r) => ({ ref: r.ref, label: r.label, seconds: n(r.seconds), lastDay: String(r.last_day) }));
}

/* ---------------- audit ---------------- */

export async function audit(actorId: number | null, action: string, target = "", detail = "") {
  await q("insert into ib_audit (actor_id, action, target, detail) values ($1, $2, $3, $4)", [actorId, action.slice(0, 40), target.slice(0, 160), detail.slice(0, 400)]);
}

export async function listAudit(filter: { limit?: number; before?: number } = {}) {
  const limit = Math.max(1, Math.min(200, filter.limit ?? 50));
  const rows = await q<{ id: unknown; actor_id: number | null; at: unknown; action: string; target: string; detail: string; actor_name: string | null }>(
    `select a.*, u.name as actor_name from ib_audit a left join ib_users u on u.id = a.actor_id
     ${filter.before ? "where a.id < $1" : ""} order by a.id desc limit ${limit}`,
    filter.before ? [filter.before] : [],
  );
  return rows.map((r) => ({ id: n(r.id), actorId: r.actor_id == null ? null : n(r.actor_id), actorName: r.actor_name ?? "Removed account", at: iso(r.at), action: r.action, target: r.target, detail: r.detail }));
}

export type WeekDigest = {
  userId: number;
  /** This week = the 7 days ending today, in the stats time zone. */
  minutes: number;
  minutesPrev: number;
  activeDays: number;
  lessons: number;
  /** Consecutive days ending today (or yesterday) with any watch/open. */
  streak: number;
  lastActivityAt: string | null;
};

/**
 * One row per member: this week vs last week, active days, distinct lessons,
 * and the current streak. One query; the admin digest card is built from it.
 */
export async function weekDigest(userId?: number): Promise<WeekDigest[]> {
  const tz = statsTz();
  const rows = await q<{ user_id: number; m7: unknown; m14: unknown; d7: unknown; l7: unknown; last_at: unknown; days: unknown }>(
    `with today as (select (now() at time zone $1)::date as d)
     select u.id as user_id,
       coalesce((select sum(watch_seconds) from ib_daily x, today where x.user_id = u.id and x.day > today.d - 7), 0) as m7,
       coalesce((select sum(watch_seconds) from ib_daily x, today where x.user_id = u.id and x.day > today.d - 14 and x.day <= today.d - 7), 0) as m14,
       coalesce((select count(*) from ib_daily x, today where x.user_id = u.id and x.day > today.d - 7 and (x.watch_seconds > 0 or x.opens > 0)), 0) as d7,
       coalesce((select count(distinct ref) from ib_daily_lessons x, today where x.user_id = u.id and x.day > today.d - 7), 0) as l7,
       u.last_seen_at as last_at,
       coalesce((select string_agg(to_char(x.day, 'YYYY-MM-DD'), ',' order by x.day desc) from ib_daily x, today where x.user_id = u.id and x.day > today.d - 60 and (x.watch_seconds > 0 or x.opens > 0)), '') as days
     from ib_users u where u.role = 'member' ${userId !== undefined ? "and u.id = $2" : ""}`,
    userId !== undefined ? [tz, userId] : [tz],
  );
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  return rows.map((r) => ({
    userId: n(r.user_id),
    minutes: Math.round(n(r.m7) / 60),
    minutesPrev: Math.round(n(r.m14) / 60),
    activeDays: n(r.d7),
    lessons: n(r.l7),
    streak: streakFrom(String(r.days ?? "").split(",").filter(Boolean), today),
    lastActivityAt: isoOrNull(r.last_at),
  }));
}

/** Consecutive active days ending today or yesterday (a streak survives until the day after a miss). */
export function streakFrom(activeDaysDesc: string[], today: string): number {
  if (!activeDaysDesc.length) return 0;
  const set = new Set(activeDaysDesc);
  const dayMs = 86_400_000;
  const start = Date.parse(`${today}T00:00:00Z`);
  let cursor = set.has(today) ? start : set.has(isoDay(start - dayMs)) ? start - dayMs : Number.NaN;
  if (Number.isNaN(cursor)) return 0;
  let streak = 0;
  while (set.has(isoDay(cursor))) {
    streak += 1;
    cursor -= dayMs;
  }
  return streak;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
