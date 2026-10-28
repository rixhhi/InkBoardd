import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { env } from "../../config/env.ts";
import type { Db } from "../db.ts";
import { n } from "./util.ts";

/* ---------------- one-time import from the first (SQLite) version ---------------- */

export async function importLegacySqlite(db: Db) {
  if (env("AUTH_DB") === ":memory:") return;
  const file = join(process.cwd(), "data", "inkboard.sqlite");
  if (!existsSync(file)) return;
  const count = await db.query<{ n: unknown }>("select count(*) as n from ib_users");
  if (n(count[0]?.n) > 0) return;
  const { DatabaseSync } = await import("node:sqlite");
  const old = new DatabaseSync(file, { readOnly: true });
  try {
    const users = old.prepare("select * from users order by id").all() as { id: number; email: string; name: string; password_hash: string; role: string; status: string; created_at: string; last_seen_at: string | null }[];
    const idMap = new Map<number, number>();
    let superDone = false;
    for (const u of users) {
      const role = u.role === "admin" && !superDone ? "superadmin" : u.role === "admin" ? "admin" : "member";
      if (role === "superadmin") superDone = true;
      const rows = await db.query<{ id: number }>(
        "insert into ib_users (email, name, password_hash, role, status, created_at, last_seen_at) values ($1, $2, $3, $4, $5, $6, $7) returning id",
        [u.email, u.name, u.password_hash, role, u.status === "disabled" ? "disabled" : "active", u.created_at, u.last_seen_at],
      );
      if (rows[0]) idMap.set(u.id, n(rows[0].id));
    }
    const shares = old.prepare("select * from shares").all() as { kind: string; ref: string; label: string; note: string; user_id: number | null; created_at: string }[];
    for (const s of shares) {
      const uid = s.user_id == null ? null : idMap.get(s.user_id) ?? null;
      if (s.user_id != null && uid == null) continue;
      await db.query(
        "insert into ib_shares (kind, ref, label, note, audience, user_id, created_at) values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing",
        [s.kind, s.ref, s.label, s.note, uid == null ? "all" : "user", uid, s.created_at],
      );
    }
    const settings = old.prepare("select key, value from settings").all() as { key: string; value: string }[];
    for (const s of settings) await db.query("insert into ib_settings (key, value) values ($1, $2) on conflict (key) do nothing", [s.key, s.value]);
    console.log(`[accounts] imported ${users.length} account(s) and ${shares.length} share(s) from the SQLite file`);
  } finally {
    old.close();
  }
  renameSync(file, `${file}.imported`);
}
