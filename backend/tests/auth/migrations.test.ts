import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

process.env.LOG_LEVEL = "silent";
process.env.AUTH_DB = ":memory:";

const S = await import("../../src/auth/store.ts");

describe("accounts migrations", () => {
  before(async () => {
    await S.openAuthStore();
  });
  after(async () => {
    await S.closeAuthStore();
  });

  it("the shipped list runs once on boot and is recorded", async () => {
    const db = await S.store();
    const done = await S.appliedMigrations(db);
    for (const m of S.MIGRATIONS) assert.ok(done.has(m.id), `${m.id} applied at boot`);
    assert.deepEqual(await S.runMigrations(db), [], "nothing pending on the second pass");
  });

  it("a new entry runs exactly once, in order, and a failure rolls back its record", async () => {
    const db = await S.store();
    const list = [
      ...S.MIGRATIONS,
      { id: "9001_test_table", sql: "create table ib_mig_probe (id int primary key);\ninsert into ib_mig_probe values (1)" },
      { id: "9002_test_more", sql: "insert into ib_mig_probe values (2)" },
    ];
    assert.deepEqual(await S.runMigrations(db, list), ["9001_test_table", "9002_test_more"]);
    assert.deepEqual(await S.runMigrations(db, list), []);
    const rows = await db.query<{ n: unknown }>("select count(*) as n from ib_mig_probe");
    assert.equal(Number(rows[0]?.n), 2);

    const bad = [...list, { id: "9003_breaks", sql: "insert into ib_mig_probe values (2)" }];
    await assert.rejects(() => S.runMigrations(db, bad));
    const done = await S.appliedMigrations(db);
    assert.ok(!done.has("9003_breaks"), "failed step leaves no record, so the next boot retries it");
  });

  it("rejects malformed and duplicate ids before touching the database", async () => {
    const db = await S.store();
    await assert.rejects(() => S.runMigrations(db, [{ id: "nope", sql: "select 1" }]), /must look like/);
    await assert.rejects(() => S.runMigrations(db, [...S.MIGRATIONS, { id: S.MIGRATIONS[0]!.id, sql: "select 1" }]), /duplicate/);
  });
});
