import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";

// Accounts live in Postgres and the server cannot reach it (wrong URL, paused Neon project).
// Port 1 refuses at once, so this stays fast.
process.env.LOG_LEVEL = "silent";
delete process.env.AUTH_DB;
delete process.env.AUTH_DISABLED;
process.env.DATABASE_URL = "postgres://nobody:nothing@127.0.0.1:1/none";

const { buildApp } = await import("../../src/app.ts");
const S = await import("../../src/auth/store.ts");

describe("sign-in status while the account database is down", () => {
  let app: FastifyInstance;
  before(async () => {
    app = await buildApp();
  });
  after(async () => {
    await app.close();
    await S.closeAuthStore();
  });

  it("answers 503 AUTH_DB_UNAVAILABLE, not a bare 500", async () => {
    const res = await app.inject({ url: "/api/auth/status" });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().code, "AUTH_DB_UNAVAILABLE");
    assert.match(res.json().error, /account database/i);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.doesNotMatch(res.body, /127\.0\.0\.1|postgres:\/\//, "never leaks the connection string");
  });

  it("keeps health checks alive so the host does not restart the API", async () => {
    assert.equal((await app.inject({ url: "/healthz" })).statusCode, 200);
  });
});
