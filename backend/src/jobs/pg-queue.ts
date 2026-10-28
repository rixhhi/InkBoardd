import { postgresConfigured, query } from "../repositories/postgres/client.ts";

/**
 * Postgres mirrors in-process jobs. It is not a work queue: the API runs each
 * job in this process, and nothing claims rows. `pct` and `step` are copied
 * so a restart can show where a finished job stopped. Stale `running` rows are
 * not swept here — `loadStoredJobs` marks an interrupted job as error.
 */

const CREATE_SQL = `create table if not exists job_queue (
    id text primary key,
    kind text not null,
    state text not null,
    pct integer not null default 0,
    step text not null default '',
    payload jsonb not null default '{}'::jsonb,
    error text,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz
  )`;
const ALTER_PCT_SQL = "alter table job_queue add column if not exists pct integer not null default 0";
const ALTER_STEP_SQL = "alter table job_queue add column if not exists step text not null default ''";

export const jobQueueDeps: {
  postgresConfigured: () => boolean;
  query: (text: string, params?: unknown[]) => Promise<unknown>;
} = {
  postgresConfigured,
  query: (text, params) => query(text, params ?? []),
};

let queueReady: Promise<boolean> | null = null;

/** Drop the memoised DDL promise. The next ensure runs the statements again. */
export function resetJobQueueReady() {
  queueReady = null;
}

async function createJobQueue(): Promise<boolean> {
  await jobQueueDeps.query(CREATE_SQL);
  await jobQueueDeps.query(ALTER_PCT_SQL);
  await jobQueueDeps.query(ALTER_STEP_SQL);
  return true;
}

/** Create or alter `job_queue` once per process. A failed attempt is retried. */
export function ensureJobQueue(): Promise<boolean> {
  if (!jobQueueDeps.postgresConfigured()) return Promise.resolve(false);
  if (!queueReady) {
    queueReady = createJobQueue().catch((err) => {
      queueReady = null;
      throw err;
    });
  }
  return queueReady;
}

export const MIRROR_SQL = `insert into job_queue (id, kind, state, pct, step, payload, error)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7)
     on conflict (id) do update
       set state = excluded.state,
           pct = excluded.pct,
           step = excluded.step,
           error = excluded.error,
           payload = excluded.payload,
           finished_at = case when excluded.state in ('done', 'error', 'cancelled') then now() else job_queue.finished_at end`;

export async function mirrorJob(job: {
  id: string;
  kind: string;
  state: string;
  pct?: number;
  step?: string;
  error?: string;
  payload: unknown;
}): Promise<boolean> {
  if (!jobQueueDeps.postgresConfigured()) return false;
  const ready = await ensureJobQueue();
  if (!ready) return false;
  await jobQueueDeps.query(MIRROR_SQL, [
    job.id,
    job.kind,
    job.state,
    Number.isFinite(job.pct) ? Math.floor(job.pct as number) : 0,
    job.step ?? "",
    JSON.stringify(job.payload ?? {}),
    job.error ?? null,
  ]);
  return true;
}
