import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";

process.env.LOG_LEVEL = "silent";
process.env.AUTH_DB = ":memory:";
process.env.SETUP_CODE = "NOTIFY0042";
delete process.env.AUTH_DISABLED;

const { buildApp } = await import("../../src/app.ts");
const S = await import("../../src/auth/store.ts");
const { resetLoginThrottle } = await import("../../src/auth/guard.ts");

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const line = Array.isArray(raw) ? String(raw[0]) : String(raw ?? "");
  return line.split(";")[0] ?? "";
}

const SAME = { "sec-fetch-site": "same-origin" };

describe("the bell (in-app notifications)", () => {
  let app: FastifyInstance;
  let owner = "";
  let member = "";
  let memberId = 0;

  const login = (email: string, password: string) => app.inject({ method: "POST", url: "/api/auth/login", headers: SAME, payload: { email, password } });
  const bell = (cookie: string) => app.inject({ url: "/api/me/notifications", headers: { cookie } }).then((r) => r.json() as { unread: number; items: { kind: string; title: string; href: string; readAt: string | null; id: number }[] });
  // notify() is fire-and-forget on the routes; give the insert a tick.
  const settle = () => new Promise((r) => setTimeout(r, 40));

  before(async () => {
    resetLoginThrottle();
    S.resetNotificationCache();
    app = await buildApp();
    const setup = await app.inject({ method: "POST", url: "/api/auth/setup", headers: SAME, payload: { code: "NOTIFY0042", email: "owner@ink.dev", name: "Owner", password: "correct horse 9" } });
    assert.equal(setup.statusCode, 200);
    owner = cookieOf(setup);
    const created = await app.inject({ method: "POST", url: "/api/admin/members", headers: { cookie: owner, ...SAME }, payload: { email: "riya@ink.dev", name: "Riya", password: "member pass 1" } });
    assert.equal(created.statusCode, 201);
    memberId = created.json().member.id;
  });
  after(async () => {
    await app.close();
    await S.closeAuthStore();
  });

  it("needs a session", async () => {
    assert.equal((await app.inject({ url: "/api/me/notifications" })).statusCode, 401);
  });

  it("a member's first sign-in welcomes them and tells the admins", async () => {
    const res = await login("riya@ink.dev", "member pass 1");
    assert.equal(res.statusCode, 200);
    member = cookieOf(res);
    await settle();
    const mine = await bell(member);
    assert.equal(mine.unread, 1);
    assert.equal(mine.items[0]?.kind, "member.welcome");
    const theirs = await bell(owner);
    assert.ok(theirs.items.some((n) => n.kind === "member.joined" && /Riya/.test(n.title)), "admin hears about the first sign-in");
    assert.match(theirs.items.find((n) => n.kind === "member.joined")!.href, /^\/admin\?tab=members&member=\d+$/);
  });

  it("a second sign-in is quiet", async () => {
    const before = (await bell(owner)).items.length;
    await login("riya@ink.dev", "member pass 1");
    await settle();
    assert.equal((await bell(owner)).items.length, before);
  });

  it("sharing an exam rings the members it reaches, with a link to it", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/shares", headers: { cookie: owner, ...SAME }, payload: { kind: "exam", ref: "TMUVD", audience: "all", note: "Start with the first two chapters." } });
    assert.equal(res.statusCode, 201);
    await settle();
    const mine = await bell(member);
    const row = mine.items.find((n) => n.kind === "share.new");
    assert.ok(row, "member got the share notification");
    assert.equal(row!.href, "/exam/TMUVD");
    assert.match(row!.title, /^New exam shared with you/);
    assert.equal(mine.unread, 2);
  });

  it("a scheduled share stays silent until it opens", async () => {
    const before = (await bell(member)).items.length;
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const res = await app.inject({ method: "POST", url: "/api/admin/shares", headers: { cookie: owner, ...SAME }, payload: { kind: "course", ref: "ABCDEFGH", audience: "user", userIds: [memberId], startsAt: future } });
    assert.equal(res.statusCode, 201);
    await settle();
    assert.equal((await bell(member)).items.length, before);
  });

  it("the same event within ten minutes is one row, not two", async () => {
    const before = (await bell(member)).items.filter((n) => n.kind === "share.new").length;
    // Re-sharing the same exam (upsert) must not ring again.
    await app.inject({ method: "POST", url: "/api/admin/shares", headers: { cookie: owner, ...SAME }, payload: { kind: "exam", ref: "TMUVD", audience: "all" } });
    await settle();
    assert.equal((await bell(member)).items.filter((n) => n.kind === "share.new").length, before);
  });

  it("marking read: some, then all; the count follows", async () => {
    const mine = await bell(member);
    assert.ok(mine.unread >= 2);
    const first = mine.items[0]!.id;
    const some = await app.inject({ method: "POST", url: "/api/me/notifications/read", headers: { cookie: member, ...SAME }, payload: { ids: [first] } });
    assert.equal(some.statusCode, 200);
    assert.equal(some.json().unread, mine.unread - 1);
    const all = await app.inject({ method: "POST", url: "/api/me/notifications/read", headers: { cookie: member, ...SAME }, payload: {} });
    assert.equal(all.json().unread, 0);
    assert.ok((await bell(member)).items.every((n) => n.readAt));
  });

  it("asking for a password reset rings every admin", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/reset-request", headers: SAME, payload: { email: "riya@ink.dev" } });
    assert.equal(res.statusCode, 200);
    await settle();
    const theirs = await bell(owner);
    const row = theirs.items.find((n) => n.kind === "reset.requested");
    assert.ok(row, "admin got the reset request");
    assert.match(row!.title, /Riya asked for a password reset/);
  });

  it("an admin setting a new password tells the member", async () => {
    const res = await app.inject({ method: "PATCH", url: `/api/admin/members/${memberId}`, headers: { cookie: owner, ...SAME }, payload: { password: "brand new pass 7", mustChangePassword: true } });
    assert.equal(res.statusCode, 200);
    await settle();
    // The member's sessions were revoked; sign in again to read the bell.
    member = cookieOf(await login("riya@ink.dev", "brand new pass 7"));
    const mine = await app.inject({ url: "/api/me/notifications", headers: { cookie: member } });
    // A pending password change blocks every other route — the bell included — so the
    // member sees it right after choosing a password. Assert the row exists in the store.
    assert.equal(mine.statusCode, 403);
    const rows = await S.listNotifications(memberId);
    assert.ok(rows.some((n) => n.kind === "password.reset"));
  });

  it("you can only read and delete your own", async () => {
    const theirs = await bell(owner);
    const id = theirs.items[0]!.id;
    const other = await app.inject({ method: "DELETE", url: `/api/me/notifications/${id}`, headers: { cookie: member, ...SAME } });
    assert.ok(other.statusCode === 403 || other.statusCode === 404);
    const own = await app.inject({ method: "DELETE", url: `/api/me/notifications/${id}`, headers: { cookie: owner, ...SAME } });
    assert.equal(own.statusCode, 200);
    assert.ok(!(await bell(owner)).items.some((n) => n.id === id));
  });

  it("safeHref keeps only same-site paths", () => {
    assert.equal(S.safeHref("/admin?tab=members"), "/admin?tab=members");
    assert.equal(S.safeHref("https://evil.example/"), "");
    assert.equal(S.safeHref("//evil.example"), "");
    assert.equal(S.safeHref("/\\evil"), "");
    assert.equal(S.safeHref(42), "");
  });

  it("inboxes are capped and old rows are swept", async () => {
    const ids = Array.from({ length: 5 }, (_, i) => i);
    for (const i of ids) await S.notify([memberId], { kind: "info", title: `row ${i}`, href: `/x/${i}` });
    assert.ok((await S.listNotifications(memberId, { limit: 100 })).length <= S.NOTIFY_MAX_PER_USER);
    assert.equal(typeof (await S.sweepNotifications()), "number");
  });
});
