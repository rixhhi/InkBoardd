import { getPool, postgresConfigured, query } from "./client.ts";

export async function cacheGet<T = unknown>(key: string, minGen = 0): Promise<T | undefined> {
  if (!postgresConfigured()) return undefined;
  try {
    const rows = await query<{ payload: T; expires_at: Date | string; swr_gen: number | string | null }>(
      "select payload, expires_at, swr_gen from upstream_cache where cache_key = $1",
      [key],
    );
    const row = rows[0];
    if (!row) return undefined;
    if (new Date(row.expires_at).getTime() < Date.now()) return undefined;
    const written = Number(row.swr_gen ?? 0);
    if (!Number.isFinite(written) || written < minGen) return undefined;
    return row.payload;
  } catch (err) {
    console.warn("[postgres] cache get failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

export async function cacheSet(key: string, payload: unknown, ttlMs: number, gen = 0): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    const expires = new Date(Date.now() + Math.max(1_000, ttlMs));
    await pool.query(
      `insert into upstream_cache (cache_key, payload, expires_at, updated_at, swr_gen)
       values ($1, $2::jsonb, $3, now(), $4)
       on conflict (cache_key) do update
         set payload = excluded.payload,
             expires_at = excluded.expires_at,
             updated_at = now(),
             swr_gen = excluded.swr_gen`,
      [key, JSON.stringify(payload), expires, gen],
    );
  } catch (err) {
    console.warn("[postgres] cache set failed:", err instanceof Error ? err.message : err);
  }
}

export async function probeGet(lessonId: string): Promise<{ archived: boolean; checkedAt: number } | undefined> {
  if (!postgresConfigured()) return undefined;
  try {
    const rows = await query<{ archived: boolean; checked_at: Date | string }>(
      "select archived, checked_at from media_probe where lesson_id = $1",
      [lessonId],
    );
    const row = rows[0];
    if (!row) return undefined;
    return { archived: row.archived, checkedAt: new Date(row.checked_at).getTime() };
  } catch {
    return undefined;
  }
}

export async function probeSet(lessonId: string, archived: boolean): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `insert into media_probe (lesson_id, archived, checked_at)
       values ($1, $2, now())
       on conflict (lesson_id) do update set archived = excluded.archived, checked_at = now()`,
      [lessonId, archived],
    );
  } catch (err) {
    console.warn("[postgres] probe set failed:", err instanceof Error ? err.message : err);
  }
}
