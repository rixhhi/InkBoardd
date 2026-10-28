import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MIRROR_SQL, ensureJobQueue, jobQueueDeps, mirrorJob, resetJobQueueReady } from "../../src/jobs/pg-queue.ts";

test("postgres mirrors pct and step and does not claim rows", () => {
  assert.match(MIRROR_SQL, /pct/);
  assert.match(MIRROR_SQL, /step/);
  assert.match(MIRROR_SQL, /on conflict \(id\) do update/i);
  const src = readFileSync(new URL("../../src/jobs/pg-queue.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /claimQueuedJob/);
  assert.doesNotMatch(src, /CLAIM_SQL/);
  assert.doesNotMatch(src, /for update skip locked/i);
  const schema = readFileSync(new URL("../../src/repositories/postgres/schema.ts", import.meta.url), "utf8");
  assert.doesNotMatch(schema, /create table if not exists jobs\b/);
});

test("a job is not written when postgres is not configured", async () => {
  const prev = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(
      await mirrorJob({ id: "abc", kind: "lecture", state: "queued", pct: 4, step: "saving", payload: { id: "abc" } }),
      false,
    );
  } finally {
    if (prev) process.env.DATABASE_URL = prev;
  }
});

test("ensureJobQueue runs create and alter once, and retries after a failure", async () => {
  const configured = jobQueueDeps.postgresConfigured;
  const run = jobQueueDeps.query;
  try {
    resetJobQueueReady();
    jobQueueDeps.postgresConfigured = () => false;
    assert.equal(await ensureJobQueue(), false);

    const seen: string[] = [];
    let gate: (() => void) | undefined;
    const opened = new Promise<void>((resolve) => {
      gate = resolve;
    });
    jobQueueDeps.postgresConfigured = () => true;
    jobQueueDeps.query = async (sql: string) => {
      seen.push(sql);
      if (seen.length === 1) await opened;
      return [];
    };
    const first = ensureJobQueue();
    const second = ensureJobQueue();
    await Promise.resolve();
    assert.equal(seen.length, 1);
    gate?.();
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(seen.filter((sql) => /create table|alter table/i.test(sql)).length, 3);

    assert.equal(
      await mirrorJob({ id: "abc", kind: "lecture", state: "running", pct: 4, step: "saving", payload: { id: "abc" } }),
      true,
    );
    assert.equal(
      await mirrorJob({ id: "abc", kind: "lecture", state: "done", pct: 100, step: "done", payload: { id: "abc" } }),
      true,
    );
    assert.equal(seen.filter((sql) => /create table|alter table/i.test(sql)).length, 3);
    assert.equal(seen.filter((sql) => /insert into job_queue/i.test(sql)).length, 2);

    resetJobQueueReady();
    let fails = 0;
    jobQueueDeps.query = async () => {
      fails += 1;
      throw new Error("ddl failed");
    };
    await assert.rejects(() => ensureJobQueue(), /ddl failed/);
    await assert.rejects(() => ensureJobQueue(), /ddl failed/);
    assert.equal(fails, 2);
  } finally {
    jobQueueDeps.postgresConfigured = configured;
    jobQueueDeps.query = run;
    resetJobQueueReady();
  }
});

