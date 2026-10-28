import { SHARE_TTL, bumpShares, shareCache, shareVersion } from "./cache.ts";
import { one, q } from "./connection.ts";
import type { Audience, Share, ShareKind } from "./types.ts";
import { iso, isoOrNull, n } from "./util.ts";

/* ---------------- shares ---------------- */

type ShareRow = {
  id: number;
  kind: ShareKind;
  ref: string;
  label: string;
  note: string;
  audience: Audience;
  user_id: number | null;
  group_id: number | null;
  starts_at: unknown;
  expires_at: unknown;
  pinned: boolean;
  created_at: unknown;
  created_by: number | null;
};

function toShare(r: ShareRow): Share {
  return {
    id: n(r.id),
    kind: r.kind,
    ref: r.ref,
    label: r.label,
    note: r.note,
    audience: r.audience,
    userId: r.user_id == null ? null : n(r.user_id),
    groupId: r.group_id == null ? null : n(r.group_id),
    startsAt: isoOrNull(r.starts_at),
    expiresAt: isoOrNull(r.expires_at),
    pinned: Boolean(r.pinned),
    createdAt: iso(r.created_at),
    createdBy: r.created_by == null ? null : n(r.created_by),
  };
}

/** Teacher usernames are case-insensitive on Unacademy; everything else is an exact id. */
export function normalRef(kind: ShareKind, ref: string): string {
  const clean = ref.trim().slice(0, 120);
  return kind === "teacher" ? clean.toLowerCase() : clean;
}

export async function addShare(input: {
  kind: ShareKind;
  ref: string;
  label?: string;
  note?: string;
  audience: Audience;
  userId?: number | null;
  groupId?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  pinned?: boolean;
  createdBy?: number | null;
}): Promise<Share> {
  const row = await one<ShareRow>(
    `insert into ib_shares (kind, ref, label, note, audience, user_id, group_id, starts_at, expires_at, pinned, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (kind, ref, audience, coalesce(user_id, 0), coalesce(group_id, 0)) do update
       set label = excluded.label, note = excluded.note, starts_at = excluded.starts_at,
           expires_at = excluded.expires_at, pinned = excluded.pinned
     returning *`,
    [
      input.kind,
      normalRef(input.kind, input.ref),
      (input.label || "").slice(0, 160),
      (input.note || "").slice(0, 400),
      input.audience,
      input.audience === "user" ? input.userId ?? null : null,
      input.audience === "group" ? input.groupId ?? null : null,
      input.startsAt ?? null,
      input.expiresAt ?? null,
      Boolean(input.pinned),
      input.createdBy ?? null,
    ],
  );
  bumpShares();
  return toShare(row!);
}

export async function updateShare(id: number, patch: { label?: string; note?: string; startsAt?: string | null; expiresAt?: string | null; pinned?: boolean }): Promise<Share | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  const add = (col: string, v: unknown) => {
    args.push(v);
    sets.push(`${col} = $${args.length}`);
  };
  if (patch.label !== undefined) add("label", patch.label.slice(0, 160));
  if (patch.note !== undefined) add("note", patch.note.slice(0, 400));
  if (patch.startsAt !== undefined) add("starts_at", patch.startsAt);
  if (patch.expiresAt !== undefined) add("expires_at", patch.expiresAt);
  if (patch.pinned !== undefined) add("pinned", patch.pinned);
  if (!sets.length) return getShare(id);
  args.push(id);
  const row = await one<ShareRow>(`update ib_shares set ${sets.join(", ")} where id = $${args.length} returning *`, args);
  bumpShares();
  return row ? toShare(row) : null;
}

export async function getShare(id: number): Promise<Share | null> {
  const row = await one<ShareRow>("select * from ib_shares where id = $1", [id]);
  return row ? toShare(row) : null;
}

export async function removeShare(id: number): Promise<Share | null> {
  const row = await one<ShareRow>("delete from ib_shares where id = $1 returning *", [id]);
  bumpShares();
  return row ? toShare(row) : null;
}

/** Fill in a missing name once a member (or admin) opens the shared page. */
export async function labelShares(kind: ShareKind, ref: string, label: string) {
  if (!label) return;
  await q("update ib_shares set label = $1 where kind = $2 and ref = $3 and label = ''", [label.slice(0, 160), kind, normalRef(kind, ref)]);
}

export async function listShares(filter: { userId?: number; groupId?: number } = {}): Promise<Share[]> {
  if (filter.userId !== undefined) return (await q<ShareRow>("select * from ib_shares where audience = 'user' and user_id = $1 order by pinned desc, created_at desc, id desc", [filter.userId])).map(toShare);
  if (filter.groupId !== undefined) return (await q<ShareRow>("select * from ib_shares where audience = 'group' and group_id = $1 order by pinned desc, created_at desc, id desc", [filter.groupId])).map(toShare);
  return (await q<ShareRow>("select * from ib_shares order by pinned desc, created_at desc, id desc")).map(toShare);
}

/** Shares that apply to a member right now: everyone, their groups, or them; inside the date window. Cached 30 s. */
export async function sharesFor(userId: number): Promise<Share[]> {
  const hit = shareCache.get(userId);
  const now = Date.now();
  if (hit && hit.ver === shareVersion() && now - hit.at < SHARE_TTL) return hit.shares;
  const ver = shareVersion();
  const rows = await q<ShareRow>(
    `select s.* from ib_shares s
     where (s.audience = 'all'
        or (s.audience = 'user' and s.user_id = $1)
        or (s.audience = 'group' and s.group_id in (select group_id from ib_group_members where user_id = $1)))
       and (s.starts_at is null or s.starts_at <= now())
       and (s.expires_at is null or s.expires_at > now())
     order by s.pinned desc, s.created_at desc, s.id desc`,
    [userId],
  );
  const shares = rows.map(toShare);
  if (ver === shareVersion()) shareCache.set(userId, { shares, ver, at: now });
  return shares;
}

/** Record ids a member reached from inside a share (one round trip). */
export async function grantRefs(userId: number, shareId: number, refs: Iterable<string>) {
  const list = [...new Set([...refs].filter(Boolean))].slice(0, 5000);
  if (!list.length) return;
  await q("insert into ib_grants (user_id, ref, share_id) select $1, unnest($2::text[]), $3 on conflict do nothing", [userId, list, shareId]);
}

/** The active share behind a direct share or a reach-through grant, or null. */
export async function accessVia(userId: number, kind: ShareKind, ref: string): Promise<number | null> {
  if (!ref) return null;
  const key = normalRef(kind, ref);
  const active = await sharesFor(userId);
  const direct = active.find((s) => s.kind === kind && s.ref === key);
  if (direct) return direct.id;
  if (!active.length) return null;
  const row = await one<{ share_id: number }>("select share_id from ib_grants where user_id = $1 and ref = $2 and share_id = any($3::int[]) limit 1", [
    userId,
    key,
    active.map((s) => s.id),
  ]);
  return row ? n(row.share_id) : null;
}
