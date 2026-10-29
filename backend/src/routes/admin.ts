/**
 * Admin API (staff only; the guard enforces it, and /api/admin/admins is super-admin only).
 *
 *   overview · members · groups · shares · settings · activity (last hour) · audit · admins
 */
import type { FastifyInstance } from "fastify";
import { EXAMS } from "@inkboard/shared/exams";
import * as S from "../auth/store.ts";
import { body, dateOrNull, fail, idParam, parseShareRef, publicUser, sharesView, str } from "./auth-common.ts";

type Patch = { name?: string; status?: S.UserStatus; password?: string; email?: string; mustChange?: boolean };

/** Validate a name/email/password/status patch shared by members and admins. */
async function userPatch(b: Record<string, unknown>, current: S.User): Promise<Patch | { error: [number, string, string] }> {
  const patch: Patch = {};
  if (typeof b.name === "string") patch.name = str(b.name, 80) || current.name;
  if (b.status === "active" || b.status === "disabled") patch.status = b.status;
  if (typeof b.mustChangePassword === "boolean") patch.mustChange = b.mustChangePassword;
  if (b.email !== undefined) {
    const email = S.normalEmail(b.email);
    if (!email) return { error: [400, "BAD_EMAIL", "Enter a valid email."] };
    const other = await S.findUserByEmail(email);
    if (other && other.id !== current.id) return { error: [409, "EMAIL_TAKEN", "Someone already uses that email."] };
    patch.email = email;
  }
  if (b.password !== undefined) {
    const problem = S.passwordProblem(b.password);
    if (problem) return { error: [400, "WEAK_PASSWORD", problem] };
    patch.password = String(b.password);
  }
  return patch;
}

function describe(p: Patch): string {
  return [
    p.status ? (p.status === "active" ? "resumed" : "paused") : "",
    p.password ? "reset password" : "",
    p.mustChange === true ? "must change password" : "",
    p.name || p.email ? "edited" : "",
  ]
    .filter(Boolean)
    .join(", ") || "updated";
}

function ids(v: unknown): number[] {
  return Array.isArray(v) ? v.map(Number).filter((x) => Number.isInteger(x) && x > 0) : [];
}

export async function registerAdmin(app: FastifyInstance) {
  /* ---------------- overview ---------------- */

  app.get("/api/admin/overview", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    const [members, stats, shares, groups, daily, topLessons, recent, online, accessMode, resetRequests] = await Promise.all([
      S.listUsers(["member"]),
      S.memberStats(),
      S.listShares(),
      S.listGroups(),
      S.dailyWatch(14),
      S.topLessons(30, 8),
      S.listActivity({ limit: 25 }),
      S.onlineNow(),
      S.accessMode(),
      S.countResetRequests(),
    ]);
    const byId = new Map(stats.map((s) => [s.userId, s]));
    const weekAgo = Date.now() - 7 * 86_400_000;
    const names = new Map(members.map((m) => [m.id, m.name]));
    return {
      counts: {
        members: members.length,
        active: members.filter((m) => m.status === "active").length,
        activeThisWeek: stats.filter((s) => s.lastActivityAt && Date.parse(s.lastActivityAt) >= weekAgo).length,
        onlineNow: online.length,
        shares: shares.length,
        groups: groups.length,
        watchSeconds7d: stats.reduce((n, s) => n + s.watchSeconds7d, 0),
        resetRequests,
      },
      daily,
      topLessons,
      online: online.map((o) => ({ ...o, name: names.get(o.userId) ?? "Member" })),
      members: members.map((m) => ({ ...publicUser(m), stats: byId.get(m.id) ?? null })),
      recent: recent.map((a) => ({ ...a, user: names.has(a.userId) ? { name: names.get(a.userId)! } : null })),
      accessMode,
      activityWindowMinutes: S.ACTIVITY_KEEP_MINUTES,
    };
  });

  /* ---------------- members ---------------- */

  app.get("/api/admin/members", async () => {
    const [members, stats, groups] = await Promise.all([S.listUsers(["member"]), S.memberStats(), S.listGroups()]);
    const byId = new Map(stats.map((s) => [s.userId, s]));
    return {
      members: members.map((m) => ({
        ...publicUser(m),
        stats: byId.get(m.id) ?? null,
        groupIds: groups.filter((g) => g.memberIds.includes(m.id)).map((g) => g.id),
      })),
    };
  });

  app.post("/api/admin/members", async (req, reply) => {
    const b = body(req);
    const email = S.normalEmail(b.email);
    if (!email) return fail(reply, req, 400, "BAD_EMAIL", "Enter a valid email.");
    const problem = S.passwordProblem(b.password);
    if (problem) return fail(reply, req, 400, "WEAK_PASSWORD", problem);
    if (await S.findUserByEmail(email)) return fail(reply, req, 409, "EMAIL_TAKEN", "Someone already uses that email.");
    const user = await S.createUser({
      email,
      name: str(b.name, 80) || email.split("@")[0]!,
      password: String(b.password),
      role: "member",
      createdBy: req.user!.id,
      mustChange: b.mustChangePassword === true,
    });
    const groupIds = ids(b.groupIds);
    if (groupIds.length) await S.setUserGroups(user.id, groupIds);
    await S.audit(req.user!.id, "member.add", user.email, groupIds.length ? `groups ${groupIds.join(",")}` : "");
    return reply.status(201).send({ member: publicUser(user) });
  });

  app.get("/api/admin/members/:id", async (req, reply) => {
    const id = idParam(req);
    const user = await S.getUser(id);
    if (user?.role !== "member") return fail(reply, req, 404, "NOT_FOUND", "No such member.");
    const [stats, daily, activity, personal, effective, groupIds, groups, planner, lessons] = await Promise.all([
      S.memberStats(id),
      S.dailyWatch(30, id),
      S.listActivity({ userId: id, limit: 200 }),
      S.listShares({ userId: id }),
      S.sharesFor(id),
      S.groupsOf(id),
      S.listGroups(),
      S.plannerSummary(id),
      S.recentLessons(id, 30, 30),
    ]);
    return {
      member: publicUser(user),
      stats: stats[0] ?? null,
      daily,
      activity,
      shares: sharesView(personal),
      effectiveShares: sharesView(effective),
      groups: groups.filter((g) => groupIds.includes(g.id)).map((g) => ({ id: g.id, name: g.name })),
      planner,
      lessons,
    };
  });

  app.patch("/api/admin/members/:id", async (req, reply) => {
    const id = idParam(req);
    const user = await S.getUser(id);
    if (user?.role !== "member") return fail(reply, req, 404, "NOT_FOUND", "No such member.");
    const b = body(req);
    const patch = await userPatch(b, user);
    if ("error" in patch) return fail(reply, req, ...patch.error);
    const next = await S.updateUser(id, patch);
    if (patch.password) await S.revokeUserSessions(id);
    if (Array.isArray(b.groupIds)) await S.setUserGroups(id, ids(b.groupIds));
    await S.audit(req.user!.id, "member.edit", user.email, describe(patch) + (Array.isArray(b.groupIds) ? ", groups" : ""));
    return { member: next ? publicUser(next) : null };
  });

  app.delete("/api/admin/members/:id", async (req, reply) => {
    const id = idParam(req);
    const user = await S.getUser(id);
    if (user?.role !== "member") return fail(reply, req, 404, "NOT_FOUND", "No such member.");
    await S.deleteUser(id, ["member"]);
    await S.audit(req.user!.id, "member.remove", user.email);
    return { ok: true };
  });

  app.post("/api/admin/members/:id/signout", async (req, reply) => {
    const id = idParam(req);
    const user = await S.getUser(id);
    if (user?.role !== "member") return fail(reply, req, 404, "NOT_FOUND", "No such member.");
    await S.revokeUserSessions(id);
    await S.audit(req.user!.id, "member.signout", user.email);
    return { ok: true };
  });

  /* ---------------- groups ---------------- */

  app.get("/api/admin/groups", async () => {
    const [groups, shares] = await Promise.all([S.listGroups(), S.listShares()]);
    return { groups: groups.map((g) => ({ ...g, shareCount: shares.filter((s) => s.groupId === g.id).length })) };
  });

  app.post("/api/admin/groups", async (req, reply) => {
    const b = body(req);
    const name = str(b.name, 60);
    if (!name) return fail(reply, req, 400, "BAD_NAME", "Give the group a name.");
    if ((await S.listGroups()).some((g) => g.name.toLowerCase() === name.toLowerCase())) return fail(reply, req, 409, "NAME_TAKEN", "A group with that name exists.");
    const group = await S.createGroup(name, str(b.description, 300));
    const memberIds = ids(b.memberIds);
    if (memberIds.length) await S.setGroupMembers(group.id, memberIds);
    await S.audit(req.user!.id, "group.add", name);
    return reply.status(201).send({ group: (await S.listGroups()).find((g) => g.id === group.id) ?? group });
  });

  app.patch("/api/admin/groups/:id", async (req, reply) => {
    const id = idParam(req);
    const groups = await S.listGroups();
    const group = groups.find((g) => g.id === id);
    if (!group) return fail(reply, req, 404, "NOT_FOUND", "No such group.");
    const b = body(req);
    const name = typeof b.name === "string" ? str(b.name, 60) : undefined;
    if (name !== undefined) {
      if (!name) return fail(reply, req, 400, "BAD_NAME", "Give the group a name.");
      if (groups.some((g) => g.id !== id && g.name.toLowerCase() === name.toLowerCase())) return fail(reply, req, 409, "NAME_TAKEN", "A group with that name exists.");
    }
    await S.updateGroup(id, { name, description: typeof b.description === "string" ? str(b.description, 300) : undefined });
    if (Array.isArray(b.memberIds)) await S.setGroupMembers(id, ids(b.memberIds));
    await S.audit(req.user!.id, "group.edit", name ?? group.name);
    return { group: (await S.listGroups()).find((g) => g.id === id) ?? null };
  });

  app.delete("/api/admin/groups/:id", async (req, reply) => {
    const id = idParam(req);
    const group = (await S.listGroups()).find((g) => g.id === id);
    if (!group) return fail(reply, req, 404, "NOT_FOUND", "No such group.");
    await S.deleteGroup(id);
    await S.audit(req.user!.id, "group.remove", group.name);
    return { ok: true };
  });

  /* ---------------- shares ---------------- */

  app.get("/api/admin/shares", async () => ({ shares: sharesView(await S.listShares()) }));

  app.post("/api/admin/shares", async (req, reply) => {
    const b = body(req);
    if (!S.isShareKind(b.kind)) return fail(reply, req, 400, "BAD_KIND", "Pick what you are sharing.");
    const kind = b.kind;
    const ref = parseShareRef(kind, str(b.ref, 400));
    if (!ref) return fail(reply, req, 400, "BAD_REF", "That doesn't look like a valid id or Unacademy link.");
    const startsAt = dateOrNull(b.startsAt);
    const expiresAt = dateOrNull(b.expiresAt);
    if (startsAt === undefined && b.startsAt !== undefined) return fail(reply, req, 400, "BAD_DATE", "The start date isn't valid.");
    if (expiresAt === undefined && b.expiresAt !== undefined) return fail(reply, req, 400, "BAD_DATE", "The end date isn't valid.");
    if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) return fail(reply, req, 400, "BAD_DATE", "The end date must be after the start.");

    // Who: everyone, some groups, or some members. Legacy: userId / userIds.
    const userIds = ids(b.userIds).concat(b.userId != null && b.userId !== "" ? ids([b.userId]) : []);
    const groupIds = ids(b.groupIds);
    const audience: S.Audience = b.audience === "group" || (!b.audience && groupIds.length) ? "group" : b.audience === "user" || (!b.audience && userIds.length) ? "user" : "all";
    if (audience === "user") {
      if (!userIds.length) return fail(reply, req, 400, "BAD_MEMBER", "Pick at least one member.");
      const members = new Set((await S.listUsers(["member"])).map((m) => m.id));
      if (userIds.some((u) => !members.has(u))) return fail(reply, req, 400, "BAD_MEMBER", "Pick a member, or share with everyone.");
    }
    if (audience === "group") {
      if (!groupIds.length) return fail(reply, req, 400, "BAD_GROUP", "Pick at least one group.");
      const known = new Set((await S.listGroups()).map((g) => g.id));
      if (groupIds.some((g) => !known.has(g))) return fail(reply, req, 400, "BAD_GROUP", "That group no longer exists.");
    }

    const label = str(b.label, 160) || (kind === "exam" ? EXAMS.find((e) => e.id === ref)?.name ?? "" : "");
    const common = { kind, ref, label, note: str(b.note, 400), startsAt: startsAt ?? null, expiresAt: expiresAt ?? null, pinned: b.pinned === true, createdBy: req.user!.id };
    const created: S.Share[] = [];
    if (audience === "all") created.push(await S.addShare({ ...common, audience }));
    if (audience === "user") for (const userId of [...new Set(userIds)]) created.push(await S.addShare({ ...common, audience, userId }));
    if (audience === "group") for (const groupId of [...new Set(groupIds)]) created.push(await S.addShare({ ...common, audience, groupId }));
    let who = "everyone";
    if (audience === "user") {
      const names = new Map((await S.listUsers(["member"])).map((m) => [m.id, m.email]));
      who = `members: ${[...new Set(userIds)].map((id) => names.get(id) ?? `#${id}`).join(", ")}`;
    } else if (audience === "group") {
      const names = new Map((await S.listGroups()).map((g) => [g.id, g.name]));
      who = `groups: ${[...new Set(groupIds)].map((id) => names.get(id) ?? `#${id}`).join(", ")}`;
    }
    await S.audit(req.user!.id, "share.add", `${kind} ${label || ref}`, who);
    return reply.status(201).send({ shares: sharesView(created) });
  });

  app.patch("/api/admin/shares/:id", async (req, reply) => {
    const id = idParam(req);
    const share = await S.getShare(id);
    if (!share) return fail(reply, req, 404, "NOT_FOUND", "No such share.");
    const b = body(req);
    const startsAt = dateOrNull(b.startsAt);
    const expiresAt = dateOrNull(b.expiresAt);
    if ((startsAt === undefined && b.startsAt !== undefined) || (expiresAt === undefined && b.expiresAt !== undefined)) return fail(reply, req, 400, "BAD_DATE", "That date isn't valid.");
    const s = startsAt === undefined ? share.startsAt : startsAt;
    const e = expiresAt === undefined ? share.expiresAt : expiresAt;
    if (s && e && Date.parse(e) <= Date.parse(s)) return fail(reply, req, 400, "BAD_DATE", "The end date must be after the start.");
    const next = await S.updateShare(id, {
      label: typeof b.label === "string" ? str(b.label, 160) : undefined,
      note: typeof b.note === "string" ? str(b.note, 400) : undefined,
      startsAt,
      expiresAt,
      pinned: typeof b.pinned === "boolean" ? b.pinned : undefined,
    });
    await S.audit(req.user!.id, "share.edit", `${share.kind} ${share.label || share.ref}`);
    return { share: next ? sharesView([next])[0] : null };
  });

  app.delete("/api/admin/shares/:id", async (req, reply) => {
    const share = await S.removeShare(idParam(req));
    if (!share) return fail(reply, req, 404, "NOT_FOUND", "No such share.");
    await S.audit(req.user!.id, "share.remove", `${share.kind} ${share.label || share.ref}`);
    return { ok: true };
  });

  /* ---------------- settings ---------------- */

  app.get("/api/admin/settings", async () => ({ accessMode: await S.accessMode(), permissions: await S.memberPermissions() }));

  app.put("/api/admin/settings", async (req) => {
    const b = body(req);
    const changed: string[] = [];
    if (b.accessMode === "open" || b.accessMode === "curated") {
      await S.setSetting("access_mode", b.accessMode);
      changed.push(`access ${b.accessMode}`);
    }
    if (b.permissions && typeof b.permissions === "object") {
      const cur = await S.memberPermissions();
      const p = b.permissions as Record<string, unknown>;
      const next = { ...cur };
      for (const key of Object.keys(S.DEFAULT_PERMISSIONS) as (keyof S.MemberPermissions)[]) {
        if (typeof p[key] === "boolean" && p[key] !== cur[key]) {
          next[key] = p[key] as boolean;
          changed.push(`${key} ${next[key] ? "on" : "off"}`);
        }
      }
      await S.setSetting("member_permissions", JSON.stringify(next));
    }
    if (changed.length) await S.audit(req.user!.id, "settings", "", changed.join(", "));
    return { accessMode: await S.accessMode(), permissions: await S.memberPermissions() };
  });

  /* ---------------- activity (last hour) and audit ---------------- */

  app.get("/api/admin/activity", async (req, reply) => {
    reply.header("cache-control", "no-store");
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const userId = q.userId ? Number(q.userId) : undefined;
    const before = q.before ? Number(q.before) : undefined;
    const [items, users, online] = await Promise.all([
      S.listActivity({
        userId: Number.isInteger(userId) ? userId : undefined,
        before: Number.isInteger(before) ? before : undefined,
        kind: q.kind && /^[a-z]{2,16}$/.test(q.kind) ? q.kind : undefined,
        limit: 100,
      }),
      S.listUsers(),
      S.onlineNow(),
    ]);
    const byId = new Map(users.map((u) => [u.id, { name: u.name, email: u.email, role: u.role }]));
    return {
      windowMinutes: S.ACTIVITY_KEEP_MINUTES,
      online: online.map((o) => ({ ...o, user: byId.get(o.userId) ?? null })),
      items: items.map((a) => ({ ...a, user: byId.get(a.userId) ?? null })),
      next: items.length === 100 ? items[items.length - 1]!.id : null,
    };
  });

  app.get("/api/admin/audit", async (req) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const before = q.before ? Number(q.before) : undefined;
    const items = await S.listAudit({ limit: 50, before: Number.isInteger(before) ? before : undefined });
    return { items, next: items.length === 50 ? items[items.length - 1]!.id : null };
  });

  /* ---------------- admins (super admin only) ---------------- */

  app.get("/api/admin/admins", async () => ({ admins: (await S.listUsers(["superadmin", "admin"])).map(publicUser) }));

  app.post("/api/admin/admins", async (req, reply) => {
    const b = body(req);
    // Promote an existing member…
    if (b.memberId != null) {
      const member = await S.getUser(Number(b.memberId));
      if (member?.role !== "member") return fail(reply, req, 404, "NOT_FOUND", "No such member.");
      const next = await S.updateUser(member.id, { role: "admin" });
      await S.setUserGroups(member.id, []);
      await S.audit(req.user!.id, "admin.promote", member.email);
      return reply.status(201).send({ admin: next ? publicUser(next) : null });
    }
    // …or create a new admin account.
    const email = S.normalEmail(b.email);
    if (!email) return fail(reply, req, 400, "BAD_EMAIL", "Enter a valid email.");
    const problem = S.passwordProblem(b.password);
    if (problem) return fail(reply, req, 400, "WEAK_PASSWORD", problem);
    if (await S.findUserByEmail(email)) return fail(reply, req, 409, "EMAIL_TAKEN", "Someone already uses that email.");
    const user = await S.createUser({ email, name: str(b.name, 80) || email.split("@")[0]!, password: String(b.password), role: "admin", createdBy: req.user!.id, mustChange: b.mustChangePassword === true });
    await S.audit(req.user!.id, "admin.add", user.email);
    return reply.status(201).send({ admin: publicUser(user) });
  });

  app.patch("/api/admin/admins/:id", async (req, reply) => {
    const id = idParam(req);
    const user = await S.getUser(id);
    if (user?.role !== "admin") return fail(reply, req, 404, "NOT_FOUND", "No such admin. (The super admin edits their own account from the account menu.)");
    const b = body(req);
    const patch = await userPatch(b, user);
    if ("error" in patch) return fail(reply, req, ...patch.error);
    const demote = b.role === "member";
    const next = await S.updateUser(id, { ...patch, ...(demote ? { role: "member" as const } : {}) });
    if (patch.password) await S.revokeUserSessions(id);
    await S.audit(req.user!.id, demote ? "admin.demote" : "admin.edit", user.email, demote ? "now a member" : describe(patch));
    return { admin: next ? publicUser(next) : null };
  });

  app.delete("/api/admin/admins/:id", async (req, reply) => {
    const id = idParam(req);
    const user = await S.getUser(id);
    if (user?.role !== "admin") return fail(reply, req, 404, "NOT_FOUND", "No such admin.");
    await S.deleteUser(id, ["admin"]);
    await S.audit(req.user!.id, "admin.remove", user.email);
    return { ok: true };
  });
}
