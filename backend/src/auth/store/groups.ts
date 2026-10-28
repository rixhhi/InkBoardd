
import { bumpShares } from "./cache.ts";
import { one, q, store } from "./connection.ts";
import type { Group } from "./types.ts";
import { iso, n } from "./util.ts";

/* ---------------- groups ---------------- */

export async function listGroups(): Promise<Group[]> {
  const rows = await q<{ id: number; name: string; description: string; created_at: unknown; members: number[] | null }>(
    `select g.id, g.name, g.description, g.created_at,
            coalesce(array_agg(m.user_id order by m.user_id) filter (where m.user_id is not null), '{}') as members
     from ib_groups g left join ib_group_members m on m.group_id = g.id
     group by g.id order by lower(g.name)`,
  );
  return rows.map((r) => ({ id: n(r.id), name: r.name, description: r.description, createdAt: iso(r.created_at), memberIds: (r.members ?? []).map(n) }));
}

export async function createGroup(name: string, description = ""): Promise<Group> {
  const row = await one<{ id: number; name: string; description: string; created_at: unknown }>(
    "insert into ib_groups (name, description) values ($1, $2) returning *",
    [name.trim().slice(0, 60), description.trim().slice(0, 300)],
  );
  return { id: n(row!.id), name: row!.name, description: row!.description, createdAt: iso(row!.created_at), memberIds: [] };
}

export async function updateGroup(id: number, patch: { name?: string; description?: string }) {
  if (patch.name !== undefined) await q("update ib_groups set name = $1 where id = $2", [patch.name.trim().slice(0, 60), id]);
  if (patch.description !== undefined) await q("update ib_groups set description = $1 where id = $2", [patch.description.trim().slice(0, 300), id]);
}

export async function deleteGroup(id: number): Promise<boolean> {
  const rows = await q("delete from ib_groups where id = $1 returning id", [id]);
  bumpShares();
  return rows.length > 0;
}

export async function setGroupMembers(groupId: number, userIds: number[]) {
  const ids = [...new Set(userIds.filter((x) => Number.isInteger(x)))].slice(0, 2000);
  await (await store()).tx(async (t) => {
    await t("delete from ib_group_members where group_id = $1", [groupId]);
    if (ids.length) {
      await t(
        `insert into ib_group_members (group_id, user_id)
         select $1, u.id from ib_users u where u.id = any($2::int[]) and u.role = 'member' on conflict do nothing`,
        [groupId, ids],
      );
    }
  });
  bumpShares();
}

export async function setUserGroups(userId: number, groupIds: number[]) {
  const ids = [...new Set(groupIds.filter((x) => Number.isInteger(x)))];
  await (await store()).tx(async (t) => {
    await t("delete from ib_group_members where user_id = $1", [userId]);
    if (ids.length) await t("insert into ib_group_members (group_id, user_id) select g.id, $1 from ib_groups g where g.id = any($2::int[]) on conflict do nothing", [userId, ids]);
  });
  bumpShares();
}

export async function groupsOf(userId: number): Promise<number[]> {
  return (await q<{ group_id: number }>("select group_id from ib_group_members where user_id = $1", [userId])).map((r) => n(r.group_id));
}
