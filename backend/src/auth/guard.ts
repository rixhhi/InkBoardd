/**
 * Route admission for a private InkBoard install.
 *
 *   anonymous   → health, /api/auth/status|setup|login|logout
 *   member      → what is shared with them (curated) or everything (open), minus
 *                 features switched off (browse, search, live, downloads)
 *   admin       → everything, plus /api/admin/*
 *   superadmin  → admin, plus /api/admin/admins
 *
 * Sharing an exam opens the teachers and courses listed under it; a teacher opens
 * their courses and batches; a course opens its lessons. Those reach-through ids
 * are recorded as grants (tied to the share, so they vanish with it).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { EXAMS, examGoalIds, getExam } from "@inkboard/shared/exams";
import { jsonError } from "../http.ts";
import { env } from "../config/env.ts";
import * as S from "./store.ts";
import { getRedis } from "../repositories/redis/client.ts";

export const SESSION_COOKIE = "ib_session";

type Activity = { kind: string; ref: string; label?: string };

declare module "fastify" {
  interface FastifyRequest {
    user: S.User | null;
    grantShare: number | null;
    activity: Activity | null;
    memberFilter: "exams" | "teachers" | "live" | null;
    labelShare: { kind: S.ShareKind; ref: string } | null;
  }
}

/* ---------------- cookies ---------------- */

export function readCookie(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isHttps(req: FastifyRequest): boolean {
  if (req.protocol === "https") return true;
  const fwd = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]!.trim().toLowerCase();
  return fwd === "https";
}

/** HttpOnly session cookie. SameSite=Lax; COOKIE_SAMESITE=none for an iframe embed over https. */
export function sessionCookie(req: FastifyRequest, token: string | null, expires: Date | null): string {
  const secure = isHttps(req);
  const none = env("COOKIE_SAMESITE")?.toLowerCase() === "none" && secure;
  const parts = [`${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ""}`, "Path=/", "HttpOnly", `SameSite=${none ? "None" : "Lax"}`];
  if (secure) parts.push("Secure");
  parts.push(token && expires ? `Expires=${expires.toUTCString()}` : "Max-Age=0");
  return parts.join("; ");
}

/* ---------------- one-time setup code ---------------- */

let setupCode: string | null = null;

export function setupCodePath(): string {
  return join(process.cwd(), "data", "setup-code.txt");
}

/**
 * While no super admin exists, creating one needs a one-time code. It is printed
 * in the API log and written next to the data, so only someone with access to
 * the server can claim the install. SETUP_CODE pins it (useful in Docker).
 */
export async function ensureSetupCode(): Promise<string | null> {
  if (await S.superadminExists()) {
    setupCode = null;
    return null;
  }
  if (setupCode) return setupCode;
  setupCode = env("SETUP_CODE") || randomBytes(5).toString("hex").toUpperCase();
  const file = setupCodePath();
  try {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(file, `${setupCode}\n`, { mode: 0o600 });
  } catch {
    /* read-only disk: the log line is enough */
  }
  console.log(`[inkboard-api] No admin yet. Open the site and use setup code ${setupCode} (also in ${file}).`);
  return setupCode;
}

export async function setupCodeMatches(presented: unknown): Promise<boolean> {
  const want = await ensureSetupCode();
  if (!want || typeof presented !== "string") return false;
  const a = Buffer.from(presented.trim().toUpperCase());
  const b = Buffer.from(want.toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clearSetupCode() {
  setupCode = null;
  try {
    rmSync(setupCodePath(), { force: true });
  } catch {
    /* gone already */
  }
}

/* ---------------- login throttle ---------------- */

const failures = new Map<string, number[]>();
const WINDOW = 15 * 60_000;

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((t) => t > now - WINDOW);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

/** Seconds to wait, or 0. Five misses per account+IP, thirty per IP, in fifteen minutes. */
export function loginLockedFor(ip: string, email: string, now = Date.now()): number {
  const pair = recent(`p:${ip}|${email}`, now);
  const wide = recent(`i:${ip}`, now);
  const hit = pair.length >= 5 ? pair : wide.length >= 30 ? wide : null;
  if (!hit) return 0;
  return Math.max(1, Math.ceil((hit[0]! + WINDOW - now) / 1000));
}

export function noteLoginFailure(ip: string, email: string, now = Date.now()) {
  for (const key of [`p:${ip}|${email}`, `i:${ip}`]) {
    const list = recent(key, now);
    list.push(now);
    failures.set(key, list);
  }
  if (failures.size > 10_000) failures.clear();
}

export function clearLoginFailures(ip: string, email: string) {
  failures.delete(`p:${ip}|${email}`);
}

export function resetLoginThrottle() {
  failures.clear();
}

/* ---- shared counters (Redis) with the memory map as fallback ---- */

const LOGIN_MAX_PAIR = 5;
const LOGIN_MAX_IP = 30;
const REDIS_WAIT_MS = 400;

function throttleKeys(ip: string, email: string): [string, string] {
  // The email never goes into Redis in clear text.
  const who = createHash("sha256").update(email).digest("hex").slice(0, 24);
  return [`login:p:${ip}|${who}`, `login:i:${ip}`];
}

const NOTE_LUA = `
local a = redis.call('INCR', KEYS[1]); if a == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local b = redis.call('INCR', KEYS[2]); if b == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[1]) end
return {a, b}`;
const CHECK_LUA = `
local a = tonumber(redis.call('GET', KEYS[1]) or '0'); local b = tonumber(redis.call('GET', KEYS[2]) or '0')
return {a, b, redis.call('PTTL', KEYS[1]), redis.call('PTTL', KEYS[2])}`;
const CLEAR_LUA = `redis.call('DEL', KEYS[1]); return 1`;

async function withRedis<T>(run: (r: NonNullable<Awaited<ReturnType<typeof getRedis>>>) => Promise<T>): Promise<T | null> {
  try {
    const wait = <V,>(p: Promise<V>) =>
      Promise.race([
        p,
        new Promise<null>((resolve) => {
          const t = setTimeout(() => resolve(null), REDIS_WAIT_MS);
          if (typeof t === "object" && "unref" in t) t.unref();
        }),
      ]);
    const redis = await wait(getRedis());
    if (!redis || typeof redis.eval !== "function") return null;
    return await wait(run(redis));
  } catch {
    return null;
  }
}

/**
 * Seconds a sign-in is locked for, or 0. Counters live in Redis when it is
 * configured, so a restart or a second API process does not reset them; the
 * in-memory map answers when Redis is absent or slow.
 */
export async function loginLockedForShared(ip: string, email: string): Promise<number> {
  const [pair, wide] = throttleKeys(ip, email);
  const got = await withRedis((r) => r.eval(CHECK_LUA, 2, pair, wide) as Promise<[number, number, number, number]>);
  if (Array.isArray(got) && got.length === 4) {
    const [a, b, ta, tb] = got.map(Number) as [number, number, number, number];
    if (a >= LOGIN_MAX_PAIR && ta > 0) return Math.max(1, Math.ceil(ta / 1000));
    if (b >= LOGIN_MAX_IP && tb > 0) return Math.max(1, Math.ceil(tb / 1000));
    // Redis answered and says "not locked": that is authoritative across processes.
    return 0;
  }
  return loginLockedFor(ip, email);
}

export async function noteLoginFailureShared(ip: string, email: string): Promise<void> {
  const [pair, wide] = throttleKeys(ip, email);
  await withRedis((r) => r.eval(NOTE_LUA, 2, pair, wide, String(WINDOW)));
  // Memory stays in step as the fallback for the moment Redis goes away.
  noteLoginFailure(ip, email);
}

export async function clearLoginFailuresShared(ip: string, email: string): Promise<void> {
  const [pair] = throttleKeys(ip, email);
  await withRedis((r) => r.eval(CLEAR_LUA, 1, pair));
  clearLoginFailures(ip, email);
}

/* ---------------- policy ---------------- */

export type Rule =
  | { allow: true; perm?: keyof S.MemberPermissions; filter?: "exams" | "teachers" | "live"; activity?: Activity; needsExam?: boolean }
  | { share: S.ShareKind; ref: string; direct?: boolean; activity?: Activity; orLive?: boolean }
  /** A saved-lecture job: the member needs the job's lesson shared with them; `perm` on top for media/bundle reads. */
  | { job: string; perm?: keyof S.MemberPermissions }
  | { admin: true; superOnly?: boolean }
  | { deny: true };

const PUBLIC = new Set(["/healthz", "/readyz", "/api/auth/status", "/api/auth/setup", "/api/auth/login", "/api/auth/logout"]);
/** Reachable while a password change is pending. */
const PENDING_OK = new Set(["/api/auth/status", "/api/auth/logout", "/api/me", "/api/me/password"]);

export function isPublicPath(path: string): boolean {
  return PUBLIC.has(path);
}

function seg(path: string): string[] {
  return path.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
}

/** What a signed-in member needs to call this route. Staff skip the gates. Exported for tests. */
export function memberRule(method: string, path: string): Rule {
  const p = seg(path);
  const verb = method.toUpperCase();
  if (p[0] !== "api") return { allow: true };
  const area = p[1] ?? "";
  switch (area) {
    case "admin":
      return { admin: true, superOnly: p[2] === "admins" };
    case "auth":
    case "me":
    case "activity":
    case "upstream":
    case "study":
    case "slide":
    case "notes":
      return { allow: true };
    case "jobs":
      // POST /api/jobs/lectures (create) and every write need the Downloads switch.
      if (verb !== "GET") return { allow: true, perm: "downloads" };
      // GET /api/jobs/:id (poll) needs the job's class shared; artifacts and the
      // bundle also need Downloads, since they hand out the saved media itself.
      if (p.length >= 3 && p[2]) {
        const media = p.length >= 4 && (p[3] === "artifacts" || p[3] === "bundle.zip");
        return media ? { job: p[2], perm: "downloads" } : { job: p[2] };
      }
      return { deny: true };
    case "exams":
      if (p.length === 2) return { allow: true, filter: "exams" };
      return { share: "exam", ref: (p[2] ?? "").toUpperCase(), direct: true, activity: p[3] === "hub" ? { kind: "exam", ref: (p[2] ?? "").toUpperCase() } : undefined };
    case "test-series":
      return { share: "course", ref: p[2] ?? "" };
    case "educators":
      return { share: "teacher", ref: p[2] ?? "", activity: p.length === 3 ? { kind: "teacher", ref: (p[2] ?? "").toLowerCase() } : undefined };
    case "search":
      return { allow: true, perm: "search", filter: "teachers" };
    case "courses":
      return { share: "course", ref: p[2] ?? "", activity: p.length === 3 ? { kind: "course", ref: p[2] ?? "" } : undefined };
    case "batches":
      return { share: "batch", ref: p[2] ?? "", activity: p.length === 3 ? { kind: "batch", ref: p[2] ?? "" } : undefined };
    case "classes":
      return { share: "lesson", ref: p[2] ?? "", orLive: true };
    case "lessons":
      if (p[2] === "probe") return { allow: true };
      return { share: "lesson", ref: p[2] ?? "", activity: p[3] === "timeline" ? { kind: "lesson", ref: p[2] ?? "" } : undefined };
    case "live":
      return { allow: true, perm: "live", needsExam: true, filter: p[2] === "feed" ? "live" : undefined };
    case "live-board":
    case "live-slide":
      return { allow: true, perm: "live", needsExam: true };
    default:
      return { deny: true };
  }
}

function deny(reply: FastifyReply, req: FastifyRequest, status: 401 | 403, code: string, message: string) {
  return reply.status(status).type("application/json; charset=utf-8").send(jsonError(status, message, code, req.id));
}

function trustedOrigins(): Set<string> {
  return new Set((process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Same-origin check for writes (CSRF). Browsers send Sec-Fetch-Site on every
 * request; older ones still send Origin on POST/PUT/PATCH/DELETE.
 */
export function crossSiteWrite(req: FastifyRequest): boolean {
  const verb = req.method.toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return false;
  const origin = typeof req.headers.origin === "string" ? req.headers.origin.toLowerCase() : "";
  const site = String(req.headers["sec-fetch-site"] ?? "").toLowerCase();
  if (site === "same-origin" || site === "none") return false;
  if (origin && trustedOrigins().has(origin)) return false;
  if (site === "cross-site" || site === "same-site") return true;
  if (!origin) return false;
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    return true;
  }
  const fwd = String(req.headers["x-forwarded-host"] ?? "").split(",")[0]!.trim().toLowerCase();
  const own = String(req.headers.host ?? "").toLowerCase();
  return host !== fwd && host !== own;
}

/* ---------------- grants from responses ---------------- */

const REF_KEYS = new Set(["uid", "replayId", "classUid", "courseUid", "batchUid", "id"]);
const USER_KEYS = new Set(["username", "authorUsername", "educatorUsername"]);

/** Ids worth granting from a JSON payload. Bounded so a huge page cannot stall the request. */
export function collectRefs(value: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (out.size >= 5000 || depth > 8 || value == null) return out;
  if (Array.isArray(value)) {
    for (const v of value) collectRefs(v, out, depth + 1);
    return out;
  }
  if (typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") {
      if (REF_KEYS.has(k) && /^[A-Za-z0-9_-]{4,40}$/.test(v)) out.add(v);
      else if (USER_KEYS.has(k) && v && v.length <= 80) out.add(v.toLowerCase());
    } else if (v && typeof v === "object") {
      collectRefs(v, out, depth + 1);
    }
  }
  return out;
}

function labelFrom(kind: string, ref: string, body: Record<string, unknown>): string {
  const pick = (o: unknown, key: string) => (o && typeof o === "object" && typeof (o as Record<string, unknown>)[key] === "string" ? String((o as Record<string, unknown>)[key]) : "");
  if (kind === "exam") return EXAMS.find((e) => e.id === ref)?.name ?? ref;
  if (kind === "course") return pick(body.course, "name");
  if (kind === "batch") return pick(body.batch, "name");
  if (kind === "teacher") return pick(body.educator, "name") || ref;
  return "";
}

const seen = new Map<string, number>();

/** Same person, same page, within ten minutes: one row. */
function shouldLog(userId: number, kind: string, ref: string, now = Date.now()): boolean {
  const key = `${userId}|${kind}|${ref}`;
  if ((seen.get(key) ?? 0) > now - 10 * 60_000) return false;
  seen.set(key, now);
  if (seen.size > 20_000) seen.clear();
  return true;
}

/** Goal uids covered by a member's shared exams (an exam may span several Unacademy goals). */
export function goalsForExams(examIds: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of examIds) {
    const exam = getExam(id);
    out.add(id);
    if (exam) for (const g of examGoalIds(exam)) out.add(g);
  }
  return out;
}

/* ---------------- on-demand reach-through ---------------- */

const PARENTS: Record<S.ShareKind, S.ShareKind[]> = {
  exam: [],
  teacher: ["exam"],
  course: ["exam", "teacher"],
  batch: ["teacher", "exam"],
  lesson: ["course", "batch", "teacher"],
};

async function parentPayloads(share: S.Share): Promise<unknown[]> {
  const src = await import("../catalog/source.ts");
  const safe = <T,>(p: Promise<T>) => p.catch(() => null);
  switch (share.kind) {
    case "exam":
      return Promise.all([safe(src.loadExamHub({ goalId: share.ref })), safe(src.loadExamCourses({ goalId: share.ref, offset: 0 }))]);
    case "teacher":
      return Promise.all([safe(src.loadEducatorPage({ username: share.ref })), safe(src.loadEducatorBatches({ username: share.ref }))]);
    case "course":
      return Promise.all([safe(src.loadCourseLessons({ uid: share.ref }))]);
    case "batch":
      return Promise.all([safe(src.loadBatchDetail({ uid: share.ref }))]);
    default:
      return [];
  }
}

/**
 * A member opened something directly (bookmark, link, "Continue") before loading
 * the page that would have granted it. Look through their active shares for a
 * parent that lists it, using the same cached catalog calls the pages use.
 */
export async function resolveReach(userId: number, kind: S.ShareKind, ref: string): Promise<number | null> {
  const want = S.normalRef(kind, ref);
  const parents = (await S.sharesFor(userId)).filter((s) => PARENTS[kind].includes(s.kind)).slice(0, 8);
  for (const share of parents) {
    const refs = new Set<string>();
    for (const payload of await parentPayloads(share)) collectRefs(payload, refs);
    await S.grantRefs(userId, share.id, refs);
    if (refs.has(want)) return share.id;
  }
  return null;
}

/* ---------------- wiring ---------------- */

export function installAuth(app: FastifyInstance) {
  void S.openAuthStore().catch((err) => console.error("[accounts] store failed to open:", err));
  app.decorateRequest("user", null);
  app.decorateRequest("grantShare", null);
  app.decorateRequest("activity", null);
  app.decorateRequest("memberFilter", null);
  app.decorateRequest("labelShare", null);

  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0] || "";
    if (!path.startsWith("/api")) return;
    if (crossSiteWrite(req)) return deny(reply, req, 403, "CROSS_SITE", "Cross-site request blocked.");
    try {
      req.user = await S.userForSession(readCookie(req, SESSION_COOKIE));
    } catch (err) {
      req.log.error({ err }, "session lookup failed");
      req.user = null;
    }
    if (isPublicPath(path)) return;
    if (!req.user) return deny(reply, req, 401, "AUTH_REQUIRED", "Sign in to continue.");
    if (req.user.mustChangePassword && !PENDING_OK.has(path)) {
      return deny(reply, req, 403, "PASSWORD_CHANGE_REQUIRED", "Choose a new password to continue.");
    }
  });

  app.addHook("preHandler", async (req, reply) => {
    const user = req.user;
    const path = req.url.split("?")[0] || "";
    if (!user || !path.startsWith("/api") || isPublicPath(path)) return;
    const rule = memberRule(req.method, path);
    if (S.isStaff(user.role)) {
      if ("admin" in rule && rule.superOnly && user.role !== "superadmin") return deny(reply, req, 403, "SUPERADMIN_ONLY", "Only the super admin can manage admins.");
      req.activity = "activity" in rule && rule.activity ? rule.activity : null;
      if ("share" in rule && rule.activity) req.labelShare = { kind: rule.share, ref: rule.ref };
      return;
    }
    if ("admin" in rule) return deny(reply, req, 403, "ADMIN_ONLY", "Only an admin can do that.");
    if ("deny" in rule) return deny(reply, req, 403, "FORBIDDEN", "Not available on this account.");
    const [perms, mode] = await Promise.all([S.memberPermissions(), S.accessMode()]);
    const open = mode === "open";
    if ("job" in rule) {
      if (rule.perm && !perms[rule.perm]) return deny(reply, req, 403, "FEATURE_OFF", "Your admin has turned this off.");
      const { jobLessonId } = await import("../routes/jobs.ts");
      const lesson = await jobLessonId(rule.job);
      // An unknown job answers 404 downstream; a member must not learn more than that.
      if (!lesson) return;
      if (open) return;
      let via = await S.accessVia(user.id, "lesson", lesson);
      if (via == null) {
        try {
          via = await resolveReach(user.id, "lesson", lesson);
        } catch (err) {
          req.log.warn({ err }, "reach-through lookup failed");
        }
      }
      if (via == null) return deny(reply, req, 403, "NOT_SHARED", "This class hasn't been shared with you yet.");
      return;
    }
    if ("allow" in rule) {
      if (rule.perm && !(rule.perm === "search" && open) && !perms[rule.perm]) return deny(reply, req, 403, "FEATURE_OFF", "Your admin has turned this off.");
      if (!open && rule.needsExam) {
        const shares = await S.sharesFor(user.id);
        if (!shares.some((s) => s.kind === "exam")) return deny(reply, req, 403, "NOT_SHARED", "Live classes open once an exam is shared with you.");
      }
      if (!open && rule.filter) req.memberFilter = rule.filter;
      req.activity = rule.activity ?? null;
      return;
    }
    req.activity = rule.activity ?? null;
    if (open) return;
    if (rule.orLive && perms.live && (await S.sharesFor(user.id)).some((s) => s.kind === "exam")) return;
    let via: number | null;
    if (rule.direct) {
      via = (await S.sharesFor(user.id)).find((s) => s.kind === rule.share && s.ref === S.normalRef(rule.share, rule.ref))?.id ?? null;
    } else {
      via = await S.accessVia(user.id, rule.share, rule.ref);
      if (via == null) {
        try {
          via = await resolveReach(user.id, rule.share, rule.ref);
        } catch (err) {
          req.log.warn({ err }, "reach-through lookup failed");
        }
      }
    }
    if (via == null) return deny(reply, req, 403, "NOT_SHARED", "This hasn't been shared with you yet.");
    req.grantShare = via;
    if (rule.activity) req.labelShare = { kind: rule.share, ref: rule.ref };
  });

  app.addHook("onSend", async (req, reply, payload) => {
    const user = req.user;
    if (!user || reply.statusCode >= 400 || typeof payload !== "string") return payload;
    if (req.grantShare == null && req.memberFilter == null && req.activity == null) return payload;
    let body: unknown;
    try {
      body = JSON.parse(payload);
    } catch {
      return payload;
    }
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (req.grantShare != null && user.role === "member") {
      await S.grantRefs(user.id, req.grantShare, collectRefs(body)).catch((err) => req.log.warn({ err }, "grant write failed"));
    }
    if (req.activity) {
      const label = labelFrom(req.activity.kind, req.activity.ref, rec);
      if (req.labelShare && label) void S.labelShares(req.labelShare.kind, req.labelShare.ref, label).catch(() => {});
      if (user.role === "member" && shouldLog(user.id, req.activity.kind, req.activity.ref)) {
        void S.logActivity(user.id, { ...req.activity, label, path: req.url.slice(0, 300) }).catch(() => {});
      }
    }
    if (!req.memberFilter) return payload;
    const shares = await S.sharesFor(user.id);
    if (req.memberFilter === "exams" && Array.isArray(rec.exams)) {
      const shared = new Set(shares.filter((s) => s.kind === "exam").map((s) => s.ref));
      return JSON.stringify({ ...rec, exams: (rec.exams as { id?: string }[]).filter((e) => e && shared.has(String(e.id))) });
    }
    if (req.memberFilter === "live") {
      const goals = goalsForExams(shares.filter((s) => s.kind === "exam").map((s) => s.ref));
      const keep = (x: { goalUid?: string }) => Boolean(x?.goalUid && goals.has(x.goalUid));
      return JSON.stringify({ ...rec, live: Array.isArray(rec.live) ? (rec.live as { goalUid?: string }[]).filter(keep) : [], later: Array.isArray(rec.later) ? (rec.later as { goalUid?: string }[]).filter(keep) : [] });
    }
    if (req.memberFilter === "teachers") {
      const ok = async (u: unknown) => typeof u === "string" && (await S.accessVia(user.id, "teacher", u)) != null;
      const next: Record<string, unknown> = { ...rec };
      if (Array.isArray(rec.hits)) {
        const hits = rec.hits as { username?: string }[];
        const flags = await Promise.all(hits.map((h) => ok(h?.username)));
        next.hits = hits.filter((_, i) => flags[i]);
      }
      if (rec.exact && typeof rec.exact === "object" && !(await ok((rec.exact as { username?: string }).username))) next.exact = null;
      if (Array.isArray(rec.teachers)) {
        const list = rec.teachers as { id?: string }[];
        const flags = await Promise.all(list.map((t) => ok(t?.id)));
        next.teachers = list.filter((_, i) => flags[i]);
      }
      return JSON.stringify(next);
    }
    return payload;
  });
}
