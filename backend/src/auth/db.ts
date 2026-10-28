/**
 * One SQL surface for the accounts store.
 *
 *   DATABASE_URL set  → Postgres (Neon, RDS, local). Accounts live next to the catalog cache.
 *   otherwise         → PGlite: real Postgres compiled to WASM, persisted under backend/data/pg.
 *   AUTH_DB=":memory:" → PGlite in memory (tests).
 *
 * Same SQL in every mode, so behaviour in tests matches production.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { env } from "../config/env.ts";

export type Row = Record<string, unknown>;

export interface Db {
  readonly kind: "postgres" | "pglite";
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  tx<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<Row[]>) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function pgDb(url: string): Db {
  const pool = new pg.Pool({
    connectionString: url,
    max: 6,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 8_000,
    ssl: /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: true } : undefined,
  });
  pool.on("error", (err) => console.warn("[accounts-db] pool error:", err.message));
  return {
    kind: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pool.query(sql, params)).rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(async (sql, params = []) => (await client.query(sql, params)).rows as Row[]);
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end().catch(() => {});
    },
  };
}

async function pgliteDb(dataDir: string | null): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  // PGlite runs one statement at a time; queue transactions so they never interleave.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T,>(run: () => Promise<T>): Promise<T> => {
    const next = chain.then(run, run);
    chain = next.catch(() => {});
    return next;
  };
  return {
    kind: "pglite",
    query<T>(sql: string, params: unknown[] = []) {
      return serial(async () => (await db.query<T>(sql, params)).rows);
    },
    exec(sql: string) {
      return serial(async () => {
        await db.exec(sql);
      });
    },
    tx(fn) {
      return serial(() => db.transaction(async (t) => fn(async (sql, params = []) => (await t.query<Row>(sql, params)).rows)));
    },
    close() {
      return serial(() => db.close());
    },
  };
}

/** Where PGlite keeps its files when there is no DATABASE_URL. */
export function localDataDir(): string {
  return join(process.cwd(), "data", "pg");
}

export async function openDb(): Promise<Db> {
  const mode = env("AUTH_DB");
  if (mode === ":memory:") return pgliteDb(null);
  const url = env("AUTH_DATABASE_URL") || env("DATABASE_URL");
  if (url && mode !== "local") return pgDb(url);
  return pgliteDb(mode && mode !== "local" ? mode : localDataDir());
}
