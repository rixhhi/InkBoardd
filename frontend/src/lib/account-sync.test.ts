import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashOf, isSyncedKey, reconcile } from "./account-sync-core.ts";
import { mergeSynced } from "./account-sync-merge.ts";

describe("account sync rules", () => {
  it("syncs app data but keeps device caches local", () => {
    for (const k of ["inkboard.planner.v1", "inkboard.watch.v1", "inkboard.theme", "inkboard.planner.badges.v1", "inkboard.folio.ledgerCollapsed"]) assert.ok(isSyncedKey(k), k);
    for (const k of ["inkboard.owner", "inkboard.sync.v1", "inkboard.local.v1", "inkboard.prepared.v1", "inkboard.offline.pos.x", "inkboard.job-token.abc", "inkboard.planner.today-cache.v1", "other.key"]) assert.ok(!isSyncedKey(k), k);
  });

  it("first sync on a browser: the account wins, local-only data is uploaded", () => {
    const plan = reconcile({
      local: { "inkboard.planner.v1": "local", "inkboard.saved.v1": "only-here" },
      remote: { "inkboard.planner.v1": { value: "remote" }, "inkboard.watch.v1": { value: "w" } },
      stamps: {},
      adopt: true,
    });
    assert.deepEqual(plan.write, { "inkboard.planner.v1": "remote", "inkboard.watch.v1": "w" });
    assert.deepEqual(plan.push, [{ key: "inkboard.saved.v1", value: "only-here" }]);
  });

  it("later syncs: whichever side changed since last time wins", () => {
    const stamps = { "inkboard.a": hashOf("old"), "inkboard.b": hashOf("old") };
    const plan = reconcile({
      local: { "inkboard.a": "new-here", "inkboard.b": "old" },
      remote: { "inkboard.a": { value: "old" }, "inkboard.b": { value: "new-there" } },
      stamps,
      adopt: false,
    });
    assert.deepEqual(plan.push, [{ key: "inkboard.a", value: "new-here" }]);
    assert.deepEqual(plan.write, { "inkboard.b": "new-there" });
    assert.equal(plan.stamps["inkboard.b"], hashOf("new-there"));
  });

  it("both changed: this device wins; a local delete is pushed as a delete", () => {
    const stamps = { "inkboard.a": hashOf("old"), "inkboard.gone": hashOf("x") };
    const plan = reconcile({ local: { "inkboard.a": "mine" }, remote: { "inkboard.a": { value: "theirs" }, "inkboard.gone": { value: "x" } }, stamps, adopt: false });
    assert.deepEqual(plan.push.sort((a, b) => a.key.localeCompare(b.key)), [
      { key: "inkboard.a", value: "mine" },
      { key: "inkboard.gone", value: null },
    ]);
  });

  const task = (id: string, at: string, extra: Record<string, unknown> = {}) => ({ id, title: id, status: "pending", updatedAt: at, deletedAt: null, ...extra });
  const plan = (id: string, at: string, tasks: unknown[], extra: Record<string, unknown> = {}) => ({ id, name: id, updatedAt: at, deletedAt: null, tasks, ...extra });
  const planner = (plans: unknown[], days: unknown[] = [], activePlanId: string | null = null) =>
    JSON.stringify({ version: 3, plans, activePlanId, days, freezeWeeks: [], watchLogs: [] });

  it("both changed the planner: edits to different tasks both survive", () => {
    const base = planner([plan("p1", "2026-10-01T00:00:00Z", [task("a", "2026-10-01T00:00:00Z"), task("b", "2026-10-01T00:00:00Z")])]);
    const phone = planner([plan("p1", "2026-10-01T00:00:00Z", [task("a", "2026-10-02T00:00:00Z", { status: "done" }), task("b", "2026-10-01T00:00:00Z")])], [], "p1");
    const laptop = planner([plan("p1", "2026-10-01T00:00:00Z", [task("a", "2026-10-01T00:00:00Z"), task("b", "2026-10-03T00:00:00Z", { title: "moved" }), task("c", "2026-10-03T00:00:00Z")])], [{ date: "2026-10-03", minutesStudied: 40, tasksDone: 1, updatedAt: "2026-10-03T00:00:00Z" }]);
    const res = reconcile({ local: { "inkboard.planner.v1": phone }, remote: { "inkboard.planner.v1": { value: laptop } }, stamps: { "inkboard.planner.v1": hashOf(base) }, adopt: false });
    const merged = JSON.parse(res.write["inkboard.planner.v1"] as string);
    const byId = Object.fromEntries(merged.plans[0].tasks.map((t: { id: string }) => [t.id, t]));
    assert.equal(byId.a.status, "done");
    assert.equal(byId.b.title, "moved");
    assert.ok(byId.c);
    assert.equal(merged.days.length, 1);
    assert.equal(merged.activePlanId, "p1");
    assert.deepEqual(res.push, [{ key: "inkboard.planner.v1", value: res.write["inkboard.planner.v1"] }]);
    assert.equal(res.stamps["inkboard.planner.v1"], hashOf(res.write["inkboard.planner.v1"]));
  });

  it("a newer delete (tombstone) beats an older edit; ties keep this device", () => {
    const l = planner([plan("p1", "2026-10-05T00:00:00Z", [task("a", "2026-10-05T00:00:00Z", { deletedAt: "2026-10-05T00:00:00Z" }), task("t", "2026-10-01T00:00:00Z", { title: "mine" })])]);
    const r = planner([plan("p1", "2026-10-02T00:00:00Z", [task("a", "2026-10-02T00:00:00Z", { title: "edited" }), task("t", "2026-10-01T00:00:00Z", { title: "theirs" })])]);
    const merged = JSON.parse(mergeSynced("inkboard.planner.v1", l, r) as string);
    const byId = Object.fromEntries(merged.plans[0].tasks.map((t: { id: string }) => [t.id, t]));
    assert.ok(byId.a.deletedAt);
    assert.equal(byId.t.title, "mine");
  });

  it("only one side changed the planner: no merge, plain push/pull", () => {
    const base = planner([plan("p1", "2026-10-01T00:00:00Z", [])]);
    const mine = planner([plan("p1", "2026-10-02T00:00:00Z", [task("x", "2026-10-02T00:00:00Z")])]);
    const res = reconcile({ local: { "inkboard.planner.v1": mine }, remote: { "inkboard.planner.v1": { value: base } }, stamps: { "inkboard.planner.v1": hashOf(base) }, adopt: false });
    assert.deepEqual(res.push, [{ key: "inkboard.planner.v1", value: mine }]);
    assert.deepEqual(res.write, {});
  });

  it("unreadable values and keys without a merge rule fall back to this device", () => {
    assert.equal(mergeSynced("inkboard.planner.v1", "{bad", "{}"), null);
    assert.equal(mergeSynced("inkboard.theme", "{}", "{}"), null);
  });
});
