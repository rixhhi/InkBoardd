
import { q } from "./connection.ts";
import { NOTIFY_KEEP_DAYS } from "./notifications.ts";
import { ACTIVITY_KEEP_MINUTES } from "./types.ts";

/* ---------------- retention ---------------- */

export async function sweep(): Promise<{ activity: number; sessions: number; audit: number; daily: number }> {
  const a = await q(`delete from ib_activity where at < now() - interval '${ACTIVITY_KEEP_MINUTES} minutes' returning 1`);
  const s = await q("delete from ib_sessions where expires_at <= now() returning 1");
  const au = await q("delete from ib_audit where at < now() - interval '90 days' returning 1");
  const d = await q("delete from ib_daily where day < current_date - 400 returning 1");
  await q("delete from ib_daily_lessons where day < current_date - 400");
  // Bell rows: 60 days (see notifications.ts). Older installs may not have the table until the migration ran.
  await q(`delete from ib_notifications where created_at < now() - interval '${NOTIFY_KEEP_DAYS} days'`).catch(() => {});
  return { activity: a.length, sessions: s.length, audit: au.length, daily: d.length };
}
