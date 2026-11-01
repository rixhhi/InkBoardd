/**
 * In-app notifications. No email, no push: a bell in the header that shows
 * what happened while you were away.
 *
 *   member ← share.new        "Riya, your admin shared GATE CS with you"
 *   member ← password.reset   "Your admin set a new password. Choose your own."
 *   member ← member.welcome   first sign-in nudge
 *   admin  ← reset.requested  "Riya asked for a password reset"
 *   admin  ← member.joined    "Arjun signed in for the first time"
 *
 * Rows are small (title + optional body + optional link), per user, and
 * swept after NOTIFY_KEEP_DAYS. Unread count is cached per user for a few
 * seconds so the bell poll never costs a query on a quiet account.
 */
import { one, q } from "./connection.ts";
import { iso, isoOrNull, n } from "./util.ts";

export const NOTIFY_KEEP_DAYS = 60;
/** Per person. Older rows are trimmed when a new one arrives. */
export const NOTIFY_MAX_PER_USER = 200;

export type NotificationKind = "share.new" | "password.reset" | "member.welcome" | "reset.requested" | "member.joined" | "info";

export type Notification = {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Same-site path the row opens; "" when there is nowhere to go. */
  href: string;
  createdAt: string;
  readAt: string | null;
};

type Row = { id: unknown; kind: string; title: string; body: string | null; href: string | null; created_at: unknown; read_at: unknown };

function toNotification(r: Row): Notification {
  return {
    id: n(r.id),
    kind: r.kind as NotificationKind,
    title: r.title,
    body: r.body ?? "",
    href: r.href ?? "",
    createdAt: iso(r.created_at),
    readAt: isoOrNull(r.read_at),
  };
}

/* ---------------- unread cache ---------------- */

const UNREAD_TTL = 5_000;
const unreadCache = new Map<number, { count: number; at: number }>();

function bumpUnread(userIds: Iterable<number>) {
  for (const id of userIds) unreadCache.delete(id);
}

/** Only same-site paths are stored; anything else becomes "". */
export function safeHref(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\") || s.length > 300) return "";
  return s;
}

export type NotifyInput = { kind: NotificationKind; title: string; body?: string; href?: string };

/**
 * Write one notification to several people in one statement. Returns how many
 * rows were written. Duplicate suppression: the same kind + href for the same
 * person within ten minutes is not written twice (a share edited three times
 * in a row is one bell, not three).
 */
export async function notify(userIds: Iterable<number>, input: NotifyInput): Promise<number> {
  const ids = [...new Set([...userIds].filter((x) => Number.isInteger(x) && x > 0))];
  if (!ids.length) return 0;
  const title = input.title.trim().slice(0, 160);
  if (!title) return 0;
  const body = (input.body ?? "").trim().slice(0, 400);
  const href = safeHref(input.href);
  const rows = await q<{ user_id: unknown }>(
    `insert into ib_notifications (user_id, kind, title, body, href)
     select u, $2, $3, $4, $5 from unnest($1::int[]) as u
     where not exists (
       select 1 from ib_notifications x
       where x.user_id = u and x.kind = $2 and coalesce(x.href, '') = $5 and x.created_at > now() - interval '10 minutes'
     )
     returning user_id`,
    [ids, input.kind, title, body, href],
  );
  bumpUnread(ids);
  // Keep each inbox bounded. Cheap: only runs for people who just got a row.
  for (const id of ids) {
    await q(
      `delete from ib_notifications where user_id = $1 and id not in (
         select id from ib_notifications where user_id = $1 order by id desc limit $2)`,
      [id, NOTIFY_MAX_PER_USER],
    );
  }
  return rows.length;
}

export async function unreadCount(userId: number): Promise<number> {
  const hit = unreadCache.get(userId);
  const now = Date.now();
  if (hit && now - hit.at < UNREAD_TTL) return hit.count;
  const row = await one<{ c: unknown }>("select count(*) as c from ib_notifications where user_id = $1 and read_at is null", [userId]);
  const count = n(row?.c);
  unreadCache.set(userId, { count, at: now });
  if (unreadCache.size > 5_000) unreadCache.clear();
  return count;
}

export async function listNotifications(userId: number, opts: { limit?: number; before?: number } = {}): Promise<Notification[]> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
  const rows = opts.before
    ? await q<Row>("select * from ib_notifications where user_id = $1 and id < $2 order by id desc limit $3", [userId, opts.before, limit])
    : await q<Row>("select * from ib_notifications where user_id = $1 order by id desc limit $2", [userId, limit]);
  return rows.map(toNotification);
}

/** Mark some (ids) or all (no ids) as read. Returns how many changed. */
export async function markRead(userId: number, ids?: number[]): Promise<number> {
  const rows = ids?.length
    ? await q("update ib_notifications set read_at = now() where user_id = $1 and read_at is null and id = any($2::int[]) returning 1", [userId, ids])
    : await q("update ib_notifications set read_at = now() where user_id = $1 and read_at is null returning 1", [userId]);
  bumpUnread([userId]);
  return rows.length;
}

export async function deleteNotification(userId: number, id: number): Promise<boolean> {
  const rows = await q("delete from ib_notifications where user_id = $1 and id = $2 returning 1", [userId, id]);
  bumpUnread([userId]);
  return rows.length > 0;
}

export async function sweepNotifications(): Promise<number> {
  const rows = await q(`delete from ib_notifications where created_at < now() - interval '${NOTIFY_KEEP_DAYS} days' returning 1`);
  unreadCache.clear();
  return rows.length;
}

/** Everyone who should hear about admin-side events (reset requests, first sign-ins). */
export async function staffIds(): Promise<number[]> {
  const rows = await q<{ id: unknown }>("select id from ib_users where role in ('admin', 'superadmin') and status = 'active'");
  return rows.map((r) => n(r.id));
}

/** Members a share reaches right now: all, a group's members, or one person. */
export async function audienceOf(share: { audience: "all" | "group" | "user"; userId: number | null; groupId: number | null }): Promise<number[]> {
  if (share.audience === "user") return share.userId ? [share.userId] : [];
  if (share.audience === "group") {
    if (!share.groupId) return [];
    const rows = await q<{ user_id: unknown }>(
      "select m.user_id from ib_group_members m join ib_users u on u.id = m.user_id where m.group_id = $1 and u.role = 'member' and u.status = 'active'",
      [share.groupId],
    );
    return rows.map((r) => n(r.user_id));
  }
  const rows = await q<{ id: unknown }>("select id from ib_users where role = 'member' and status = 'active'");
  return rows.map((r) => n(r.id));
}

/** Clear everything in tests. */
export function resetNotificationCache() {
  unreadCache.clear();
}
