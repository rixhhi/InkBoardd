import pg from "pg";
import { DATABASE_URL } from "../../config/env.ts";
import { getPool, postgresConfigured } from "./client.ts";

/**
 * Schema setup uses its own client. The shared pool sets `query_timeout: 4000`,
 * which aborts a query on the client after 4s even if the server would allow
 * longer. `SET LOCAL` also does nothing outside a transaction. This client has
 * no query_timeout; the session `statement_timeout` is 30s, and `client.end()`
 * drops the connection so that setting never returns to the pool.
 */
export function schemaClientConfig(connectionString: string): pg.ClientConfig {
  return {
    connectionString,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    ssl: connectionString.includes("sslmode=require") ? true : undefined,
  };
}

export const SCHEMA_TIMEOUT_SQL = "SET statement_timeout = '30s'";

const STEPS: { name: string; sql: string }[] = [
  {
    name: "upstream_cache",
    sql: `create table if not exists upstream_cache (
    cache_key text primary key,
    payload jsonb not null,
    expires_at timestamptz not null,
    updated_at timestamptz not null default now(),
    swr_gen bigint not null default 0
  )`,
  },
  {
    name: "upstream_cache.swr_gen",
    sql: "alter table upstream_cache add column if not exists swr_gen bigint not null default 0",
  },
  {
    name: "upstream_cache_expires_idx",
    sql: "create index if not exists upstream_cache_expires_idx on upstream_cache (expires_at)",
  },
  {
    name: "media_probe",
    sql: `create table if not exists media_probe (
    lesson_id text primary key,
    archived boolean not null,
    checked_at timestamptz not null default now()
  )`,
  },
  {
    name: "catalog_search",
    sql: `create table if not exists catalog_search (
    id text primary key,
    title text not null,
    topic text not null default '',
    educator text not null default '',
    href text not null,
    document tsvector generated always as (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(topic, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(educator, '')), 'C')
    ) stored
  )`,
  },
  {
    name: "catalog_search_document_idx",
    sql: "create index if not exists catalog_search_document_idx on catalog_search using gin (document)",
  },
];

export type SchemaReport = { created: string[]; skipped: string[] };

export function formatSchemaSummary(created: string[], skipped: string[]): string {
  const skippedNames = new Set(skipped.map((line) => line.split(" (")[0] || line));
  const applied = created.filter((name) => !skippedNames.has(name));
  return `[schema] created: ${applied.join(", ") || "(none)"}; skipped: ${skipped.join(", ") || "(none)"}`;
}

export async function applySchema(client: { query: (sql: string) => Promise<unknown> }): Promise<SchemaReport> {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const step of STEPS) {
    try {
      await client.query(step.sql);
      created.push(step.name);
    } catch (err) {
      skipped.push(`${step.name} (${err instanceof Error ? err.message : err})`);
    }
  }
  let hasTrgm = false;
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    created.push("pg_trgm");
    hasTrgm = true;
  } catch (err) {
    skipped.push(`pg_trgm (${err instanceof Error ? err.message : err})`);
  }
  if (hasTrgm) {
    try {
      await client.query(
        "CREATE INDEX IF NOT EXISTS catalog_search_title_trgm ON catalog_search USING gin (title gin_trgm_ops)",
      );
      created.push("catalog_search_title_trgm");
    } catch (err) {
      skipped.push(`catalog_search_title_trgm (${err instanceof Error ? err.message : err})`);
    }
  } else {
    skipped.push("catalog_search_title_trgm (pg_trgm unavailable)");
  }
  return { created, skipped };
}

export async function ensureSchema(): Promise<void> {
  if (!postgresConfigured() || !DATABASE_URL) return;
  const client = new pg.Client(schemaClientConfig(DATABASE_URL));
  const created: string[] = [];
  const skipped: string[] = [];
  try {
    await client.connect();
    await client.query(SCHEMA_TIMEOUT_SQL);
    const report = await applySchema(client);
    created.push(...report.created);
    skipped.push(...report.skipped);
  } catch (err) {
    skipped.push(`connect (${err instanceof Error ? err.message : err})`);
  } finally {
    await client.end().catch(() => {});
  }
  console.log(formatSchemaSummary(created, skipped));
}

export async function pruneExpiredCache(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  try {
    const res = await pool.query("DELETE FROM upstream_cache WHERE expires_at < now()");
    return res.rowCount ?? 0;
  } catch {
    return 0;
  }
}
