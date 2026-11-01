/**
 * Accounts API.
 *
 *   /api/auth/*   status, one-time super-admin setup, login, logout   (public)
 *   /api/me*      the signed-in person: profile, shares, stats, sessions, synced app state
 *   /api/activity watch beacons from the player
 *   /api/admin/*  see routes/admin.ts (staff; enforced in auth/guard.ts)
 */
import type { FastifyInstance } from "fastify";
import { deviceName } from "@inkboard/shared/device";
import { jsonError } from "../http.ts";
import * as S from "../auth/store.ts";
import {
  SESSION_COOKIE,
  clearLoginFailuresShared,
  clearSetupCode,
  ensureSetupCode,
  loginLockedForShared,
  noteLoginFailureShared,
  readCookie,
  sessionCookie,
  setupCodeMatches,
} from "../auth/guard.ts";
import { body, fail, idParam, publicUser, sharesView, startSession, str } from "./auth-common.ts";
import { registerAdmin } from "./admin.ts";

export { parseShareRef } from "./auth-common.ts";

const SWEEP_EVERY_MS = 5 * 60_000;

export async function registerAuth(app: FastifyInstance) {
  void ensureSetupCode().catch((err) => app.log.error({ err }, "setup code check failed"));

  let sweeping = false;
  const runSweep = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await S.sweep();
    } catch {
      /* store closed during shutdown, or a transient db error; next tick retries */
    } finally {
      sweeping = false;
    }
  };
  const timer = setInterval(() => void runSweep(), SWEEP_EVERY_MS);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    await S.closeAuthStore().catch(() => {});
  });

  /* ---------------- public ---------------- */

  app.get("/api/auth/status", async (req, reply) => {
    reply.header("cache-control", "no-store");
    const needsSetup = !(await S.superadminExists());
    if (needsSetup) await ensureSetupCode();
    return { needsSetup, user: req.user ? publicUser(req.user) : null };
  });

  app.post("/api/auth/setup", async (req, reply) => {
    if (await S.superadminExists()) return fail(reply, req, 409, "ALREADY_SET_UP", "An admin already exists. Sign in instead.");
    const b = body(req);
    const ip = req.ip || "local";
    const locked = await loginLockedForShared(ip, "setup");
    if (locked) return reply.header("retry-after", String(locked)).status(429).send(jsonError(429, "Too many tries. Wait a few minutes.", "RATE_LIMIT", req.id));
    if (!(await setupCodeMatches(b.code))) {
      await noteLoginFailureShared(ip, "setup");
      return fail(reply, req, 403, "BAD_SETUP_CODE", "That setup code is wrong. It is printed in the server log.");
    }
    const email = S.normalEmail(b.email);
    if (!email) return fail(reply, req, 400, "BAD_EMAIL", "Enter a valid email.");
    const problem = S.passwordProblem(b.password);
    if (problem) return fail(reply, req, 400, "WEAK_PASSWORD", problem);
    const user = await S.createFirstAdmin({ email, name: str(b.name, 80) || "Admin", password: String(b.password) });
    if (!user) return fail(reply, req, 409, "ALREADY_SET_UP", "An admin already exists. Sign in instead.");
    clearSetupCode();
    await S.audit(user.id, "setup", user.email, "Created the super admin account");
    await startSession(req, reply, user);
    return { user: publicUser(user) };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const b = body(req);
    const email = S.normalEmail(b.email) ?? "";
    const password = typeof b.password === "string" ? b.password : "";
    const ip = req.ip || "local";
    const locked = await loginLockedForShared(ip, email);
    if (locked) {
      return reply
        .header("retry-after", String(locked))
        .status(429)
        .send(jsonError(429, `Too many attempts. Try again in ${Math.ceil(locked / 60)} min.`, "RATE_LIMIT", req.id));
    }
    const found = email ? await S.findUserByEmail(email) : null;
    if (!found) S.burnPasswordCheck(password);
    const ok = Boolean(found && password && S.verifyPassword(password, found.passwordHash));
    if (!found || !ok) {
      await noteLoginFailureShared(ip, email);
      return fail(reply, req, 401, "BAD_LOGIN", "Email or password is wrong.");
    }
    if (found.status !== "active") return fail(reply, req, 403, "DISABLED", "This account is paused. Ask your admin.");
    await clearLoginFailuresShared(ip, email);
    const { passwordHash: _hash, ...user } = found;
    // Store the short device name ("Chrome on Linux"), not the 120-char user-agent: this label is shown in admin feeds.
    if (user.role === "member") void S.logActivity(user.id, { kind: "login", label: deviceName(String(req.headers["user-agent"] ?? "")).name }).catch(() => {});
    // First sign-in ever (last_seen_at is still null): welcome the member, tell the admins.
    if (user.role === "member" && !user.lastSeenAt) {
      void Promise.all([
        S.notify([user.id], {
          kind: "member.welcome",
          title: `Welcome, ${user.name || "there"}`,
          body: "Home shows what your admin shared with you. The Planner turns it into a study plan with a calendar and a memory board. This bell will tell you when something new is shared.",
          href: "/",
        }),
        S.staffIds().then((staff) =>
          S.notify(staff, {
            kind: "member.joined",
            title: `${user.name || user.email} signed in for the first time`,
            body: `Signed in from ${deviceName(String(req.headers["user-agent"] ?? "")).name}.`,
            href: `/admin?tab=members&member=${user.id}`,
          }),
        ),
      ]).catch(() => {});
    }
    await startSession(req, reply, user);
    return { user: publicUser(user) };
  });

  /**
   * "Forgot your password?" Members have no email reset (admins set passwords), so this
   * flags the account for the admin: a badge on Members, a count on the overview, an
   * audit row. Always 200 so the endpoint says nothing about which emails exist.
   */
  app.post("/api/auth/reset-request", async (req, reply) => {
    reply.header("cache-control", "no-store");
    const b = body(req);
    const email = S.normalEmail(b.email);
    const ip = req.ip || "local";
    // Same bucket as sign-in misses: five per account+IP in fifteen minutes.
    const locked = await loginLockedForShared(ip, `reset:${email ?? ""}`);
    if (locked) return reply.header("retry-after", String(locked)).status(429).send(jsonError(429, "Too many requests. Try again later.", "RATE_LIMIT", req.id));
    await noteLoginFailureShared(ip, `reset:${email ?? ""}`);
    if (email) {
      const flagged = await S.requestPasswordReset(email).catch(() => false);
      if (flagged) {
        const user = await S.findUserByEmail(email);
        await S.audit(user?.id ?? null, "password.reset_requested", email, `from ${ip}`).catch(() => {});
        // Bell for every admin: this is the only channel a member has to reach them.
        void S.notify(await S.staffIds(), {
          kind: "reset.requested",
          title: `${user?.name || email} asked for a password reset`,
          body: "Open the member, set a new password and share it with them. The badge clears when you do.",
          href: user ? `/admin?tab=members&member=${user.id}` : "/admin?tab=members",
        }).catch(() => {});
      }
    }
    return { ok: true, message: "If that account exists, your admin has been told. They will set a new password and share it with you." };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    await S.revokeSession(readCookie(req, SESSION_COOKIE)).catch(() => {});
    reply.header("set-cookie", sessionCookie(req, null, null));
    return { ok: true };
  });

  /* ---------------- signed-in person ---------------- */

  app.get("/api/me", async (req, reply) => {
    const user = req.user!;
    reply.header("cache-control", "no-store");
    const staff = S.isStaff(user.role);
    const [accessMode, permissions, shares] = await Promise.all([S.accessMode(), S.memberPermissions(), staff ? S.listShares() : S.sharesFor(user.id)]);
    return { user: publicUser(user), accessMode, permissions, shares: sharesView(shares) };
  });

  app.get("/api/me/summary", async (req) => {
    const user = req.user!;
    const [stats, daily, lessons, recent] = await Promise.all([
      S.memberStats(user.id),
      S.dailyWatch(14, user.id),
      S.recentLessons(user.id, 30, 20),
      S.listActivity({ userId: user.id, limit: 40 }),
    ]);
    return { stats: stats[0] ?? null, daily, lessons, recent };
  });

  app.post("/api/me/password", async (req, reply) => {
    const user = req.user!;
    const b = body(req);
    const found = await S.findUserByEmail(user.email);
    if (!found || typeof b.current !== "string" || !S.verifyPassword(b.current, found.passwordHash)) {
      return fail(reply, req, 400, "BAD_PASSWORD", "Your current password is wrong.");
    }
    const problem = S.passwordProblem(b.next);
    if (problem) return fail(reply, req, 400, "WEAK_PASSWORD", problem);
    if (b.current === b.next) return fail(reply, req, 400, "SAME_PASSWORD", "Pick a password you haven't used here.");
    await S.updateUser(user.id, { password: String(b.next), mustChange: false });
    // Every other device signs out; this one gets a fresh session.
    await S.revokeUserSessions(user.id);
    await S.audit(user.id, "password", user.email, "Changed own password");
    const next = (await S.getUser(user.id)) ?? user;
    await startSession(req, reply, next);
    return { ok: true, user: publicUser(next) };
  });

  app.get("/api/me/sessions", async (req, reply) => {
    reply.header("cache-control", "no-store");
    return { sessions: await S.listSessions(req.user!.id, readCookie(req, SESSION_COOKIE)) };
  });

  app.delete("/api/me/sessions/:id", async (req, reply) => {
    const id = String((req.params as { id?: string }).id ?? "");
    if (!/^[a-f0-9]{12}$/.test(id)) return fail(reply, req, 400, "BAD_ID", "Unknown session.");
    const ok = await S.revokeSessionById(req.user!.id, id);
    if (!ok) return fail(reply, req, 404, "NOT_FOUND", "That session already ended.");
    return { ok: true };
  });

  /** Sign out of every other device. */
  app.post("/api/me/sessions/revoke-others", async (req) => {
    await S.revokeUserSessions(req.user!.id, readCookie(req, SESSION_COOKIE));
    return { ok: true };
  });

  /* Synced app data (plans, history, saved, preferences). */

  app.get("/api/me/state", async (req, reply) => {
    reply.header("cache-control", "no-store");
    return { state: await S.getUserState(req.user!.id), at: new Date().toISOString() };
  });

  // 2 MB here (the global cap is 1 MB): one synced value may be up to 600 KB and the
  // browser batches by UTF-8 bytes, so a batch of Hindi-heavy notes needs the headroom.
  app.put("/api/me/state", { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
    const b = body(req);
    const raw = b.entries;
    if (!raw || typeof raw !== "object") return fail(reply, req, 400, "BAD_STATE", "Nothing to save.");
    const entries = (Array.isArray(raw) ? raw : Object.entries(raw).map(([key, value]) => ({ key, value })))
      .slice(0, 60)
      .map((e) => (e && typeof e === "object" ? (e as { key?: unknown; value?: unknown; base?: unknown }) : {}))
      .filter((e): e is { key: string; value: string | null; base?: unknown } => typeof e.key === "string" && (typeof e.value === "string" || e.value === null))
      .map((e) => ({ key: e.key, value: e.value, ...(typeof e.base === "string" && e.base.length <= 32 ? { base: e.base } : {}) }));
    try {
      return await S.putUserState(req.user!.id, entries);
    } catch (err) {
      if (err instanceof Error && err.message === "STATE_TOO_LARGE") return fail(reply, req, 413, "STATE_TOO_LARGE", "Your saved data is over the 4 MB limit.");
      throw err;
    }
  });

  /* ---------------- notifications (the bell) ---------------- */

  /** Polled by the header bell: unread count + the newest rows. Cheap on a quiet account (count is cached). */
  app.get("/api/me/notifications", async (req, reply) => {
    reply.header("cache-control", "no-store");
    const userId = req.user!.id;
    const query = req.query as { before?: string; limit?: string };
    const before = Number(query.before) || undefined;
    const limit = Number(query.limit) || undefined;
    const [unread, items] = await Promise.all([S.unreadCount(userId), S.listNotifications(userId, { before, limit })]);
    return { unread, items };
  });

  /** Body `{ ids?: number[] }` — some, or everything when omitted. */
  app.post("/api/me/notifications/read", async (req) => {
    const b = body(req);
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 200) : undefined;
    const changed = await S.markRead(req.user!.id, ids);
    return { ok: true, changed, unread: await S.unreadCount(req.user!.id) };
  });

  app.delete("/api/me/notifications/:id", async (req, reply) => {
    const id = idParam(req);
    if (!(await S.deleteNotification(req.user!.id, id))) return fail(reply, req, 404, "NOT_FOUND", "That notification is gone already.");
    return { ok: true };
  });

  app.post("/api/activity", async (req) => {
    const user = req.user!;
    if (user.role !== "member") return { ok: true };
    const b = body(req);
    const kind = str(b.kind, 16);
    if (kind !== "watch" && kind !== "page") return { ok: false };
    const seconds = Math.max(0, Math.min(300, Number(b.seconds) || 0));
    if (kind === "watch" && seconds < 1) return { ok: true };
    await S.logActivity(user.id, { kind, ref: str(b.ref, 60), label: str(b.label, 200), path: str(b.path, 300), seconds });
    return { ok: true };
  });

  await registerAdmin(app);
}
