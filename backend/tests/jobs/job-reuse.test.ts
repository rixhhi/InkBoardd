import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { JOB_DIR } from "../../src/config/env.ts";
import { forgetJob, jobId, lectureJobPayload, lectureRunCount, rehydrateJob } from "../../src/routes/jobs.ts";
import { testApp } from "../helpers/app.ts";

describe("an evicted done lecture is reused", () => {
  let app: FastifyInstance | undefined;

  after(async () => {
    await app?.close();
  });

  it("does not start a new directory when the done job is only on disk", async () => {
    const payload = lectureJobPayload({ id: "lessonreuse1", title: "Reuse", remux: true, enhance: false });
    assert.ok(payload);
    const jid = jobId("lecture", payload);
    const dir = join(JOB_DIR, jid);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "job.json"),
      JSON.stringify({
        id: jid,
        kind: "lecture",
        state: "done",
        pct: 100,
        step: "done",
        outDir: dir,
        payload,
      }),
    );
    forgetJob(jid);
    app = await testApp();
    forgetJob(jid);
    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/lectures",
      headers: { "content-type": "application/json" },
      payload: { id: "lessonreuse1", title: "Reuse", remux: true, enhance: false },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { id: string; state: string; token?: string };
    assert.equal(body.id, jid);
    assert.equal(body.state, "done");
    assert.equal(body.token, undefined);
    assert.deepEqual(
      readdirSync(JOB_DIR).filter((name) => name.startsWith(`${jid}-`)),
      [],
    );
  });

  it("two identical posts share one directory and one run", async () => {
    app = await testApp();
    const lessonId = "lessonrace1";
    const payload = lectureJobPayload({ id: lessonId, title: "Race", remux: true, enhance: false });
    assert.ok(payload);
    const jid = jobId("lecture", payload);
    forgetJob(jid);
    if (existsSync(JOB_DIR)) {
      for (const name of readdirSync(JOB_DIR)) {
        if (name === jid || name.startsWith(`${jid}-`)) rmSync(join(JOB_DIR, name), { recursive: true, force: true });
      }
    }
    const runs = lectureRunCount(jid);
    const send = () =>
      app!.inject({
        method: "POST",
        url: "/api/jobs/lectures",
        headers: { "content-type": "application/json" },
        payload: { id: lessonId, title: "Race", remux: true, enhance: false },
      });
    const [first, second] = await Promise.all([send(), send()]);
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    const a = first.json() as { id: string; token?: string };
    const b = second.json() as { id: string; token?: string };
    assert.equal(a.id, jid);
    assert.equal(b.id, jid);
    const tokens = [a.token, b.token].filter((token) => typeof token === "string" && token.length > 0);
    assert.equal(tokens.length, 1);
    assert.equal(lectureRunCount(jid), runs + 1);
    assert.equal(readdirSync(JOB_DIR).filter((name) => name === jid || name.startsWith(`${jid}-`)).length, 1);
  });

  it("a job stored while the directory is read is kept", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "ink-rehydrate-race-"));
    const id = "rehydrace1";
    const jobDir = join(dir, id);
    mkdirSync(jobDir, { recursive: true });
    writeFileSync(
      join(jobDir, "job.json"),
      JSON.stringify({ id, kind: "lecture", state: "done", pct: 100, step: "done", outDir: jobDir, payload: {} }),
    );
    forgetJob(id);
    const [left, right] = await Promise.all([rehydrateJob(id, dir), rehydrateJob(id, dir)]);
    assert.ok(left);
    assert.equal(left, right);
  });
});
