import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";

process.env.LOG_LEVEL = "silent";
process.env.AUTH_DB = ":memory:";
process.env.SETUP_CODE = "TESTCODE42";
delete process.env.AUTH_DISABLED;

const { buildApp } = await import("../../src/app.ts");
const S = await import("../../src/auth/store.ts");
const { memberRule, collectRefs, loginLockedFor, noteLoginFailure, resetLoginThrottle, crossSiteWrite } = await import("../../src/auth/guard.ts");
const { parseShareRef } = await import("../../src/routes/auth.ts");

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const line = Array.isArray(raw) ? String(raw[0]) : String(raw ?? "");
  return line.split(";")[0] ?? "";
}

describe("accounts and access", () => {
  let app: FastifyInstance;
  let owner = "";
  let admin = "";
  let member = "";
  let memberId = 0;
  let adminId = 0;

  const login = async (email: string, password: string) => app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });

  before(async () => {
    // The login throttle is process-wide (per IP + email, and 30 misses per IP). Every inject
    // comes from 127.0.0.1, so start clean instead of inheriting misses from an earlier file.
    resetLoginThrottle();
    app = await buildApp();
  });
  after(async () => {
    await app.close();
    await S.closeAuthStore();
  });

  it("everything but health and sign-in needs a session", async () => {
    assert.equal((await app.inject({ url: "/healthz" })).statusCode, 200);
    const status = await app.inject({ url: "/api/auth/status" });
    assert.equal(status.statusCode, 200);
    assert.equal(status.json().needsSetup, true);
    for (const url of ["/api/exams", "/api/courses/ABCD1234", "/api/admin/overview", "/api/me", "/api/me/state", "/api/lessons/ABCDEFGH/timeline"]) {
      const res = await app.inject({ url });
      assert.equal(res.statusCode, 401, url);
      assert.equal(res.json().code, "AUTH_REQUIRED");
    }
  });

  it("the super admin needs the setup code, a valid email and a strong password", async () => {
    const wrong = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { code: "NOPE", email: "a@b.co", password: "longpassword1" } });
    assert.equal(wrong.statusCode, 403);
    const weak = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { code: "TESTCODE42", email: "a@b.co", password: "short" } });
    assert.equal(weak.statusCode, 400);
    const ok = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { code: "testcode42", email: "Owner@Ink.dev", name: "Owner", password: "correct horse 9" } });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().user.role, "superadmin");
    assert.equal(ok.json().user.email, "owner@ink.dev");
    const cookie = String(ok.headers["set-cookie"]);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    owner = cookieOf(ok);
  });

  it("setup works exactly once", async () => {
    const again = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { code: "TESTCODE42", email: "x@y.co", password: "another pass 1" } });
    assert.equal(again.statusCode, 409);
    assert.equal((await S.listUsers(["superadmin", "admin"])).length, 1);
    const status = await app.inject({ url: "/api/auth/status", headers: { cookie: owner } });
    assert.equal(status.json().needsSetup, false);
  });

  it("only the super admin creates admins", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/admins", headers: { cookie: owner }, payload: { email: "ada@ink.dev", name: "Ada", password: "admin pass 12" } });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().admin.role, "admin");
    adminId = res.json().admin.id;
    admin = cookieOf(await login("ada@ink.dev", "admin pass 12"));
    const asAdmin = await app.inject({ url: "/api/admin/admins", headers: { cookie: admin } });
    assert.equal(asAdmin.statusCode, 403);
    assert.equal(asAdmin.json().code, "SUPERADMIN_ONLY");
    const list = await app.inject({ url: "/api/admin/admins", headers: { cookie: owner } });
    assert.deepEqual(list.json().admins.map((a: { role: string }) => a.role).sort(), ["admin", "superadmin"]);
  });

  it("admins create members; there is no self sign-up", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/members", headers: { cookie: admin }, payload: { email: "riya@ink.dev", name: "Riya", password: "member pass 1" } });
    assert.equal(res.statusCode, 201);
    memberId = res.json().member.id;
    const dup = await app.inject({ method: "POST", url: "/api/admin/members", headers: { cookie: admin }, payload: { email: "RIYA@ink.dev", password: "member pass 1" } });
    assert.equal(dup.statusCode, 409);
    const signedIn = await login("riya@ink.dev", "member pass 1");
    assert.equal(signedIn.statusCode, 200);
    member = cookieOf(signedIn);
    const asMember = await app.inject({ method: "POST", url: "/api/admin/members", headers: { cookie: member }, payload: { email: "z@ink.dev", password: "member pass 1" } });
    assert.equal(asMember.statusCode, 403);
    assert.equal(asMember.json().code, "ADMIN_ONLY");
  });

  it("a wrong password and an unknown email get the same answer", async () => {
    resetLoginThrottle();
    const a = await login("riya@ink.dev", "nope nope 1");
    const b = await login("ghost@ink.dev", "nope nope 1");
    assert.equal(a.statusCode, 401);
    assert.equal(b.statusCode, 401);
    assert.equal(a.json().error, b.json().error);
    resetLoginThrottle();
  });

  it("a member sees only shared exams and cannot open unshared content", async () => {
    const none = await app.inject({ url: "/api/exams", headers: { cookie: member } });
    assert.equal(none.statusCode, 200);
    assert.deepEqual(none.json().exams, []);
    const share = await app.inject({ method: "POST", url: "/api/admin/shares", headers: { cookie: admin }, payload: { kind: "exam", ref: "TMUVD" } });
    assert.equal(share.statusCode, 201);
    assert.equal(share.json().shares[0].audience, "all");
    const some = await app.inject({ url: "/api/exams", headers: { cookie: member } });
    assert.deepEqual(some.json().exams.map((e: { id: string }) => e.id), ["TMUVD"]);
    const adminList = await app.inject({ url: "/api/exams", headers: { cookie: admin } });
    assert.ok(adminList.json().exams.length > 10, "admin sees every exam");
    for (const url of ["/api/courses/ABCD1234", "/api/batches/ABCD1234", "/api/lessons/ABCDEFGH/timeline", "/api/educators/someone", "/api/exams/YOTUH/hub"]) {
      const res = await app.inject({ url, headers: { cookie: member } });
      assert.equal(res.statusCode, 403, url);
      assert.equal(res.json().code, "NOT_SHARED", url);
    }
  });

  it("group shares reach only the group's members", async () => {
    const other = await app.inject({ method: "POST", url: "/api/admin/members", headers: { cookie: admin }, payload: { email: "arjun@ink.dev", name: "Arjun", password: "member pass 2" } });
    const arjun = cookieOf(await login("arjun@ink.dev", "member pass 2"));
    const group = await app.inject({ method: "POST", url: "/api/admin/groups", headers: { cookie: admin }, payload: { name: "NEET 2027", memberIds: [memberId] } });
    assert.equal(group.statusCode, 201);
    assert.deepEqual(group.json().group.memberIds, [memberId]);
    const gid = group.json().group.id;
    const share = await app.inject({ method: "POST", url: "/api/admin/shares", headers: { cookie: admin }, payload: { kind: "exam", ref: "YOTUH", audience: "group", groupIds: [gid], pinned: true, note: "Start here" } });
    assert.equal(share.statusCode, 201);
    const riya = await app.inject({ url: "/api/me", headers: { cookie: member } });
    assert.ok(riya.json().shares.some((s: { ref: string; pinned: boolean }) => s.ref === "YOTUH" && s.pinned));
    const arj = await app.inject({ url: "/api/me", headers: { cookie: arjun } });
    assert.ok(!arj.json().shares.some((s: { ref: string }) => s.ref === "YOTUH"));
    // Moving Arjun into the group gives him the share at once.
    await app.inject({ method: "PATCH", url: `/api/admin/members/${other.json().member.id}`, headers: { cookie: admin }, payload: { groupIds: [gid] } });
    const arj2 = await app.inject({ url: "/api/me", headers: { cookie: arjun } });
    assert.ok(arj2.json().shares.some((s: { ref: string }) => s.ref === "YOTUH"));
    // Deleting the group removes its shares.
    await app.inject({ method: "DELETE", url: `/api/admin/groups/${gid}`, headers: { cookie: admin } });
    const riya2 = await app.inject({ url: "/api/me", headers: { cookie: member } });
    assert.ok(!riya2.json().shares.some((s: { ref: string }) => s.ref === "YOTUH"));
  });

  it("shares respect their start and end dates, and can be edited", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const res = await app.inject({ method: "POST", url: "/api/admin/shares", headers: { cookie: admin }, payload: { kind: "teacher", ref: "Seep.Pahuja", audience: "user", userIds: [memberId], startsAt: future } });
    assert.equal(res.statusCode, 201);
    const id = res.json().shares[0].id;
    let me = await app.inject({ url: "/api/me", headers: { cookie: member } });
    assert.ok(!me.json().shares.some((s: { id: number }) => s.id === id), "not yet started");
    const edit = await app.inject({ method: "PATCH", url: `/api/admin/shares/${id}`, headers: { cookie: admin }, payload: { startsAt: null, note: "Watch the revision series" } });
    assert.equal(edit.statusCode, 200);
    assert.equal(edit.json().share.note, "Watch the revision series");
    me = await app.inject({ url: "/api/me", headers: { cookie: member } });
    assert.ok(me.json().shares.some((s: { id: number }) => s.id === id), "visible once started");
    const bad = await app.inject({ method: "PATCH", url: `/api/admin/shares/${id}`, headers: { cookie: admin }, payload: { startsAt: future, expiresAt: new Date().toISOString() } });
    assert.equal(bad.statusCode, 400);
    await app.inject({ method: "PATCH", url: `/api/admin/shares/${id}`, headers: { cookie: admin }, payload: { expiresAt: new Date(Date.now() - 1000).toISOString() } });
    me = await app.inject({ url: "/api/me", headers: { cookie: member } });
    assert.ok(!me.json().shares.some((s: { id: number }) => s.id === id), "hidden once expired");
  });

  it("features the admin switched off are refused", async () => {
    const off = await app.inject({ method: "POST", url: "/api/jobs/lectures", headers: { cookie: member }, payload: { id: "ABCDEFGH" } });
    assert.equal(off.statusCode, 403);
    assert.equal(off.json().code, "FEATURE_OFF");
    const search = await app.inject({ url: "/api/search/educators?q=physics", headers: { cookie: member } });
    assert.equal(search.statusCode, 403);
    await app.inject({ method: "PUT", url: "/api/admin/settings", headers: { cookie: admin }, payload: { permissions: { live: false } } });
    const live = await app.inject({ url: "/api/live/feed", headers: { cookie: member } });
    assert.equal(live.statusCode, 403);
    assert.equal(live.json().code, "FEATURE_OFF");
    await app.inject({ method: "PUT", url: "/api/admin/settings", headers: { cookie: admin }, payload: { permissions: { live: true, browse: true } } });
    const settings = await app.inject({ url: "/api/admin/settings", headers: { cookie: admin } });
    assert.equal(settings.json().permissions.browse, true);
  });

  it("live needs at least one shared exam", async () => {
    const all = await S.listShares();
    for (const s of all.filter((x) => x.kind === "exam")) await app.inject({ method: "DELETE", url: `/api/admin/shares/${s.id}`, headers: { cookie: admin } });
    const live = await app.inject({ url: "/api/live/feed", headers: { cookie: member } });
    assert.equal(live.statusCode, 403);
    assert.equal(live.json().code, "NOT_SHARED");
    await app.inject({ method: "POST", url: "/api/admin/shares", headers: { cookie: admin }, payload: { kind: "exam", ref: "TMUVD" } });
  });

  it("open mode lets members browse everything", async () => {
    await app.inject({ method: "PUT", url: "/api/admin/settings", headers: { cookie: admin }, payload: { accessMode: "open" } });
    const all = await app.inject({ url: "/api/exams", headers: { cookie: member } });
    assert.ok(all.json().exams.length > 10);
    await app.inject({ method: "PUT", url: "/api/admin/settings", headers: { cookie: admin }, payload: { accessMode: "curated" } });
  });

  it("watch beacons land in the member's stats, the last-hour log and the admin overview", async () => {
    const beacon = await app.inject({ method: "POST", url: "/api/activity", headers: { cookie: member }, payload: { kind: "watch", ref: "ABCDEFGH", label: "Kinematics 1", seconds: 60 } });
    assert.equal(beacon.statusCode, 200);
    const mine = await app.inject({ url: "/api/me/summary", headers: { cookie: member } });
    assert.equal(mine.json().stats.watchSeconds7d, 60);
    assert.equal(mine.json().lessons[0].label, "Kinematics 1");
    const overview = await app.inject({ url: "/api/admin/overview", headers: { cookie: admin } });
    assert.equal(overview.statusCode, 200);
    assert.equal(overview.json().counts.members, 2);
    assert.equal(overview.json().counts.watchSeconds7d, 60);
    assert.equal(overview.json().activityWindowMinutes, 60);
    assert.ok(overview.json().online.some((o: { userId: number }) => o.userId === memberId));
    const detail = await app.inject({ url: `/api/admin/members/${memberId}`, headers: { cookie: admin } });
    assert.ok(detail.json().activity.some((a: { kind: string; label: string }) => a.kind === "watch" && a.label === "Kinematics 1"));
    assert.equal(detail.json().lessons[0].ref, "ABCDEFGH");
  });

  it("raw activity older than an hour is gone, but daily totals stay", async () => {
    const db = await S.store();
    await db.query("insert into ib_activity (user_id, at, kind, label) values ($1, now() - interval '2 hours', 'page', 'old visit')", [memberId]);
    const log = await app.inject({ url: "/api/admin/activity", headers: { cookie: admin } });
    assert.ok(!log.json().items.some((a: { label: string }) => a.label === "old visit"));
    const swept = await S.sweep();
    assert.ok(swept.activity >= 1);
    const mine = await app.inject({ url: "/api/me/summary", headers: { cookie: member } });
    assert.equal(mine.json().stats.watchSeconds7d, 60);
  });

  it("app data syncs per account", async () => {
    const put = await app.inject({ method: "PUT", url: "/api/me/state", headers: { cookie: member }, payload: { entries: [{ key: "inkboard.planner.v1", value: '{"plans":[]}' }, { key: "evil", value: "x" }] } });
    assert.equal(put.statusCode, 200);
    assert.deepEqual(put.json().rejected, ["evil"]);
    const got = await app.inject({ url: "/api/me/state", headers: { cookie: member } });
    assert.equal(got.json().state["inkboard.planner.v1"].value, '{"plans":[]}');
    const someoneElse = await app.inject({ url: "/api/me/state", headers: { cookie: admin } });
    assert.deepEqual(someoneElse.json().state, {});
    await app.inject({ method: "PUT", url: "/api/me/state", headers: { cookie: member }, payload: { entries: { "inkboard.planner.v1": null } } });
    const gone = await app.inject({ url: "/api/me/state", headers: { cookie: member } });
    assert.deepEqual(gone.json().state, {});
  });

  it("compare-and-set sync: a stale write comes back as a conflict instead of overwriting", async () => {
    const key = "inkboard.planner.v1";
    const put = (value: string, base?: string) =>
      app.inject({ method: "PUT", url: "/api/me/state", headers: { cookie: member }, payload: { entries: [{ key, value, ...(base ? { base } : {}) }] } });
    const { hashOf } = await import("../../../frontend/src/lib/account-sync-core.ts");
    for (const v of [null, "", '{"plans":[]}', "नमस्ते ✓", "x".repeat(5000)]) assert.equal(S.stateHash(v), hashOf(v), "server and browser hash alike");
    const first = await put('{"plans":["phone"]}', S.stateHash(null));
    assert.deepEqual(first.json().conflicts, []);
    // Laptop still thinks the key is empty: refused, current value returned for merging.
    const stale = await put('{"plans":["laptop"]}', S.stateHash(null));
    assert.deepEqual(stale.json().conflicts, [{ key, value: '{"plans":["phone"]}' }]);
    const kept = await app.inject({ url: "/api/me/state", headers: { cookie: member } });
    assert.equal(kept.json().state[key].value, '{"plans":["phone"]}');
    // After merging it writes on top of the version it saw.
    const merged = await put('{"plans":["phone","laptop"]}', S.stateHash('{"plans":["phone"]}'));
    assert.deepEqual(merged.json().conflicts, []);
    const now = await app.inject({ url: "/api/me/state", headers: { cookie: member } });
    assert.equal(now.json().state[key].value, '{"plans":["phone","laptop"]}');
    // Writes without a base stay plain upserts (older clients keep working).
    assert.deepEqual((await put('{"plans":[]}')).json().conflicts, []);
    await app.inject({ method: "PUT", url: "/api/me/state", headers: { cookie: member }, payload: { entries: { [key]: null } } });
  });

  it("a forced password change blocks everything until it's done", async () => {
    const created = await app.inject({ method: "POST", url: "/api/admin/members", headers: { cookie: admin }, payload: { email: "new@ink.dev", password: "temp pass 123", mustChangePassword: true } });
    assert.equal(created.json().member.mustChangePassword, true);
    const c = cookieOf(await login("new@ink.dev", "temp pass 123"));
    assert.equal((await app.inject({ url: "/api/me", headers: { cookie: c } })).statusCode, 200);
    const blocked = await app.inject({ url: "/api/exams", headers: { cookie: c } });
    assert.equal(blocked.statusCode, 403);
    assert.equal(blocked.json().code, "PASSWORD_CHANGE_REQUIRED");
    const same = await app.inject({ method: "POST", url: "/api/me/password", headers: { cookie: c }, payload: { current: "temp pass 123", next: "temp pass 123" } });
    assert.equal(same.statusCode, 400);
    const changed = await app.inject({ method: "POST", url: "/api/me/password", headers: { cookie: c }, payload: { current: "temp pass 123", next: "my own pass 77" } });
    assert.equal(changed.statusCode, 200);
    assert.equal(changed.json().user.mustChangePassword, false);
    const fresh = cookieOf(changed);
    assert.equal((await app.inject({ url: "/api/exams", headers: { cookie: fresh } })).statusCode, 200);
    assert.equal((await app.inject({ url: "/api/me", headers: { cookie: c } })).statusCode, 401, "old session is revoked");
  });

  it("people see their sessions and can sign out other devices", async () => {
    const second = cookieOf(await login("riya@ink.dev", "member pass 1"));
    const list = await app.inject({ url: "/api/me/sessions", headers: { cookie: member } });
    const sessions = list.json().sessions as { id: string; current: boolean }[];
    assert.ok(sessions.length >= 2);
    assert.equal(sessions.filter((s) => s.current).length, 1);
    await app.inject({ method: "POST", url: "/api/me/sessions/revoke-others", headers: { cookie: member } });
    assert.equal((await app.inject({ url: "/api/me", headers: { cookie: second } })).statusCode, 401);
    assert.equal((await app.inject({ url: "/api/me", headers: { cookie: member } })).statusCode, 200);
  });

  it("admin actions are written to the audit log", async () => {
    const res = await app.inject({ url: "/api/admin/audit", headers: { cookie: owner } });
    const actions = (res.json().items as { action: string }[]).map((a) => a.action);
    for (const a of ["setup", "admin.add", "member.add", "group.add", "share.add", "share.edit", "settings"]) assert.ok(actions.includes(a), a);
  });

  it("pausing a member signs them out at once", async () => {
    const paused = await app.inject({ method: "PATCH", url: `/api/admin/members/${memberId}`, headers: { cookie: admin }, payload: { status: "disabled" } });
    assert.equal(paused.json().member.status, "disabled");
    const me = await app.inject({ url: "/api/me", headers: { cookie: member } });
    assert.equal(me.statusCode, 401);
    const again = await login("riya@ink.dev", "member pass 1");
    assert.equal(again.statusCode, 403);
    assert.equal(again.json().code, "DISABLED");
  });

  it("the super admin can demote and remove admins, but admins cannot touch the super admin", async () => {
    const demote = await app.inject({ method: "PATCH", url: `/api/admin/admins/${adminId}`, headers: { cookie: owner }, payload: { role: "member" } });
    assert.equal(demote.json().admin.role, "member");
    assert.equal((await app.inject({ url: "/api/admin/overview", headers: { cookie: admin } })).statusCode, 401, "role change signs them out");
    const promote = await app.inject({ method: "POST", url: "/api/admin/admins", headers: { cookie: owner }, payload: { memberId: adminId } });
    assert.equal(promote.json().admin.role, "admin");
    const superId = (await S.listUsers(["superadmin"]))[0]!.id;
    const touch = await app.inject({ method: "DELETE", url: `/api/admin/admins/${superId}`, headers: { cookie: owner } });
    assert.equal(touch.statusCode, 404);
    const del = await app.inject({ method: "DELETE", url: `/api/admin/admins/${adminId}`, headers: { cookie: owner } });
    assert.equal(del.statusCode, 200);
  });

  it("logout revokes the session server-side", async () => {
    const c = cookieOf(await login("owner@ink.dev", "correct horse 9"));
    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: c } });
    assert.equal((await app.inject({ url: "/api/me", headers: { cookie: c } })).statusCode, 401);
  });

  it("cross-site writes are blocked", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/members", headers: { cookie: owner, origin: "https://evil.example", host: "ink.local" }, payload: {} });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, "CROSS_SITE");
  });
});

describe("access rules (units)", () => {
  it("maps routes to the share they need", () => {
    assert.deepEqual(memberRule("GET", "/api/courses/ABC123/lessons"), { share: "course", ref: "ABC123", activity: undefined });
    assert.deepEqual(memberRule("GET", "/api/educators/Some.One"), { share: "teacher", ref: "Some.One", activity: { kind: "teacher", ref: "some.one" } });
    assert.deepEqual(memberRule("GET", "/api/exams"), { allow: true, filter: "exams" });
    assert.deepEqual(memberRule("GET", "/api/admin/admins"), { admin: true, superOnly: true });
    assert.ok("admin" in memberRule("GET", "/api/admin/members"));
    assert.ok("deny" in memberRule("GET", "/api/unknown-thing"));
    assert.deepEqual(memberRule("DELETE", "/api/jobs/x"), { allow: true, perm: "downloads" });
    assert.deepEqual(memberRule("GET", "/api/live/feed"), { allow: true, perm: "live", needsExam: true, filter: "live" });
  });

  it("collects ids and usernames from catalog payloads", () => {
    const refs = collectRefs({ course: { uid: "COURSE01", authorUsername: "Teach.Er" }, lessons: [{ uid: "L1L1L1L1", replayId: "REPLAY01" }, { uid: "L2L2L2L2", replayId: null }] });
    for (const r of ["COURSE01", "teach.er", "L1L1L1L1", "REPLAY01", "L2L2L2L2"]) assert.ok(refs.has(r), r);
  });

  it("parses pasted Unacademy links", () => {
    assert.equal(parseShareRef("teacher", "https://unacademy.com/@Seep.Pahuja"), "seep.pahuja");
    assert.equal(parseShareRef("course", "https://unacademy.com/course/human-reproduction/Z8BE30BH"), "Z8BE30BH");
    assert.equal(parseShareRef("exam", "neet-ug"), "YOTUH");
    assert.equal(parseShareRef("exam", "tmuvd"), "TMUVD");
    assert.equal(parseShareRef("course", "../../etc"), null);
  });

  it("locks out after five misses for one account and IP", () => {
    resetLoginThrottle();
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) noteLoginFailure("1.2.3.4", "a@b.co", t);
    assert.equal(loginLockedFor("1.2.3.4", "a@b.co", t), 0);
    noteLoginFailure("1.2.3.4", "a@b.co", t);
    assert.ok(loginLockedFor("1.2.3.4", "a@b.co", t) > 0);
    assert.equal(loginLockedFor("1.2.3.4", "other@b.co", t), 0);
    assert.equal(loginLockedFor("1.2.3.4", "a@b.co", t + 16 * 60_000), 0);
    resetLoginThrottle();
  });

  it("treats same-host Origin as same-site", () => {
    const req = (origin: string, host: string) => ({ method: "POST", headers: { origin, host } }) as never;
    assert.equal(crossSiteWrite(req("http://ink.local:3000", "ink.local:3000")), false);
    assert.equal(crossSiteWrite(req("https://evil.example", "ink.local:3000")), true);
  });
});

describe("grants follow their share", () => {
  it("removing a share removes everything it opened", async () => {
    await S.closeAuthStore();
    const u = await S.createUser({ email: "m@ink.dev", name: "M", password: "member pass 1", role: "member" });
    const share = await S.addShare({ kind: "course", ref: "COURSE01", audience: "user", userId: u.id });
    await S.grantRefs(u.id, share.id, ["LESSON01", "LESSON02"]);
    assert.equal(await S.accessVia(u.id, "course", "COURSE01"), share.id);
    assert.equal(await S.accessVia(u.id, "lesson", "LESSON01"), share.id);
    assert.equal(await S.accessVia(u.id, "lesson", "LESSON99"), null);
    await S.removeShare(share.id);
    assert.equal(await S.accessVia(u.id, "course", "COURSE01"), null);
    assert.equal(await S.accessVia(u.id, "lesson", "LESSON01"), null);
    await S.closeAuthStore();
  });

  it("an everyone-share applies to each member; a personal share only to its member", async () => {
    const a = await S.createUser({ email: "a@ink.dev", name: "A", password: "member pass 1", role: "member" });
    const b = await S.createUser({ email: "b@ink.dev", name: "B", password: "member pass 1", role: "member" });
    await S.addShare({ kind: "exam", ref: "YOTUH", audience: "all" });
    await S.addShare({ kind: "teacher", ref: "Seep.Pahuja", audience: "user", userId: a.id });
    assert.ok(await S.accessVia(a.id, "exam", "YOTUH"));
    assert.ok(await S.accessVia(b.id, "exam", "YOTUH"));
    assert.ok(await S.accessVia(a.id, "teacher", "seep.pahuja"));
    assert.equal(await S.accessVia(b.id, "teacher", "seep.pahuja"), null);
    await S.closeAuthStore();
  });

  it("passwords are salted scrypt and verify", () => {
    const h1 = S.hashPassword("correct horse 9");
    const h2 = S.hashPassword("correct horse 9");
    assert.notEqual(h1, h2);
    assert.ok(S.verifyPassword("correct horse 9", h1));
    assert.ok(!S.verifyPassword("correct horse 8", h1));
  });
});
