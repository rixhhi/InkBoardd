import { createHash, randomBytes } from "node:crypto";
import { SESSION_TTL, bumpShares, forgetUserSessions, sessionCache } from "./cache.ts";
import { one, q } from "./connection.ts";
import { hashPassword } from "./passwords.ts";
import { type Role, SESSION_DAYS, type User, type UserStatus } from "./types.ts";
import { iso, isoOrNull, n } from "./util.ts";

/* ---------------- users ---------------- */

type UserRow = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  must_change_password: boolean;
  created_at: unknown;
  last_seen_at: unknown;
};

function toUser(row: UserRow): User {
  return {
    id: n(row.id),
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: iso(row.created_at),
    lastSeenAt: isoOrNull(row.last_seen_at),
  };
}

export async function superadminExists(): Promise<boolean> {
  return Boolean(await one("select 1 as ok from ib_users where role = 'superadmin' limit 1"));
}

export async function createUser(input: { email: string; name: string; password: string; role: Role; createdBy?: number | null; mustChange?: boolean }): Promise<User> {
  const row = await one<UserRow>(
    `insert into ib_users (email, name, password_hash, role, must_change_password, created_by)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [input.email, input.name.trim().slice(0, 80) || input.email, hashPassword(input.password), input.role, Boolean(input.mustChange), input.createdBy ?? null],
  );
  return toUser(row!);
}

/** The super admin, exactly once. A partial unique index makes a second one impossible even under a race. */
export async function createFirstAdmin(input: { email: string; name: string; password: string }): Promise<User | null> {
  try {
    const row = await one<UserRow>(
      `insert into ib_users (email, name, password_hash, role)
       select $1, $2, $3, 'superadmin' where not exists (select 1 from ib_users where role = 'superadmin')
       returning *`,
      [input.email, input.name.trim().slice(0, 80) || input.email, hashPassword(input.password)],
    );
    return row ? toUser(row) : null;
  } catch {
    return null;
  }
}

export async function findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const row = await one<UserRow>("select * from ib_users where lower(email) = lower($1)", [email]);
  return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
}

export async function getUser(id: number): Promise<User | null> {
  if (!Number.isInteger(id)) return null;
  const row = await one<UserRow>("select * from ib_users where id = $1", [id]);
  return row ? toUser(row) : null;
}

export async function listUsers(roles?: Role[]): Promise<User[]> {
  const rows = roles?.length
    ? await q<UserRow>("select * from ib_users where role = any($1::text[]) order by created_at desc, id desc", [roles])
    : await q<UserRow>("select * from ib_users order by created_at desc, id desc");
  return rows.map(toUser);
}

export async function updateUser(
  id: number,
  patch: { name?: string; status?: UserStatus; password?: string; email?: string; role?: Role; mustChange?: boolean },
): Promise<User | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  const add = (col: string, v: unknown) => {
    args.push(v);
    sets.push(`${col} = $${args.length}`);
  };
  if (patch.name !== undefined) add("name", patch.name.trim().slice(0, 80));
  if (patch.email !== undefined) add("email", patch.email);
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.role !== undefined) add("role", patch.role);
  if (patch.password !== undefined) add("password_hash", hashPassword(patch.password));
  if (patch.mustChange !== undefined) add("must_change_password", patch.mustChange);
  if (sets.length) {
    args.push(id);
    await q(`update ib_users set ${sets.join(", ")} where id = $${args.length}`, args);
  }
  forgetUserSessions(id);
  if (patch.status === "disabled" || patch.role !== undefined) await revokeUserSessions(id);
  if (patch.role !== undefined) bumpShares();
  return getUser(id);
}

export async function deleteUser(id: number, roles: Role[] = ["member"]): Promise<boolean> {
  const rows = await q("delete from ib_users where id = $1 and role = any($2::text[]) returning id", [id, roles]);
  forgetUserSessions(id);
  bumpShares();
  return rows.length > 0;
}

/* ---------------- sessions ---------------- */

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number, meta: { ip?: string; userAgent?: string } = {}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await q("insert into ib_sessions (token_hash, user_id, expires_at, ip, user_agent) values ($1, $2, $3, $4, $5)", [
    tokenHash(token),
    userId,
    expiresAt.toISOString(),
    (meta.ip || "").slice(0, 64),
    (meta.userAgent || "").slice(0, 200),
  ]);
  return { token, expiresAt };
}

const lastTouch = new Map<string, number>();

/** Active user for a cookie token. Expired, revoked or paused → null. Cached 30 s. */
export async function userForSession(token: string | undefined): Promise<User | null> {
  if (!token || token.length > 200) return null;
  const h = tokenHash(token);
  const hit = sessionCache.get(h);
  const now = Date.now();
  if (hit && now - hit.at < SESSION_TTL) return hit.user;
  const row = await one<UserRow>(
    `select u.* from ib_sessions s join ib_users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.status = 'active'`,
    [h],
  );
  if (!row) {
    sessionCache.delete(h);
    return null;
  }
  const user = toUser(row);
  sessionCache.set(h, { user, at: now });
  if (sessionCache.size > 5000) sessionCache.clear();
  if ((lastTouch.get(h) ?? 0) < now - 60_000) {
    lastTouch.set(h, now);
    if (lastTouch.size > 5000) lastTouch.clear();
    void q("update ib_users set last_seen_at = now() where id = $1", [user.id]).catch(() => {});
    void q("update ib_sessions set last_used_at = now() where token_hash = $1", [h]).catch(() => {});
  }
  return user;
}

export type SessionInfo = { id: string; createdAt: string; lastUsedAt: string; ip: string; userAgent: string; current: boolean };

export async function listSessions(userId: number, currentToken?: string): Promise<SessionInfo[]> {
  const cur = currentToken ? tokenHash(currentToken) : "";
  const rows = await q<{ token_hash: string; created_at: unknown; last_used_at: unknown; ip: string; user_agent: string }>(
    "select token_hash, created_at, last_used_at, ip, user_agent from ib_sessions where user_id = $1 and expires_at > now() order by last_used_at desc",
    [userId],
  );
  return rows.map((r) => ({
    id: r.token_hash.slice(0, 12),
    createdAt: iso(r.created_at),
    lastUsedAt: iso(r.last_used_at),
    ip: r.ip,
    userAgent: r.user_agent,
    current: r.token_hash === cur,
  }));
}

export async function revokeSession(token: string | undefined) {
  if (!token) return;
  const h = tokenHash(token);
  sessionCache.delete(h);
  await q("delete from ib_sessions where token_hash = $1", [h]);
}

export async function revokeSessionById(userId: number, idPrefix: string): Promise<boolean> {
  if (!/^[a-f0-9]{12}$/.test(idPrefix)) return false;
  const rows = await q<{ token_hash: string }>("delete from ib_sessions where user_id = $1 and left(token_hash, 12) = $2 returning token_hash", [userId, idPrefix]);
  for (const r of rows) sessionCache.delete(r.token_hash);
  return rows.length > 0;
}

export async function revokeUserSessions(userId: number, keepToken?: string) {
  forgetUserSessions(userId);
  if (keepToken) await q("delete from ib_sessions where user_id = $1 and token_hash <> $2", [userId, tokenHash(keepToken)]);
  else await q("delete from ib_sessions where user_id = $1", [userId]);
}
