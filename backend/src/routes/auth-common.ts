/** Small helpers shared by the auth and admin routes. */
import type { FastifyReply, FastifyRequest } from "fastify";
import { EXAMS } from "@inkboard/shared/exams";
import { jsonError } from "../http.ts";
import * as S from "../auth/store.ts";
import { sessionCookie } from "../auth/guard.ts";

export type Body = Record<string, unknown>;

export function body(req: FastifyRequest): Body {
  return req.body && typeof req.body === "object" ? (req.body as Body) : {};
}

export function fail(reply: FastifyReply, req: FastifyRequest, status: number, code: string, message: string) {
  return reply.status(status).send(jsonError(status, message, code, req.id));
}

export function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function idParam(req: FastifyRequest): number {
  const id = Number((req.params as { id?: string }).id);
  return Number.isInteger(id) && id > 0 ? id : -1;
}

export async function startSession(req: FastifyRequest, reply: FastifyReply, user: S.User): Promise<string> {
  const { token, expiresAt } = await S.createSession(user.id, { ip: req.ip, userAgent: String(req.headers["user-agent"] ?? "") });
  reply.header("set-cookie", sessionCookie(req, token, expiresAt));
  reply.header("cache-control", "no-store");
  return token;
}

export function publicUser(u: S.User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
    lastSeenAt: u.lastSeenAt,
  };
}

/** A date string from a form, or null. Rejects nonsense. */
export function dateOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

export function sharesView(list: S.Share[]) {
  return list.map((s) => ({ ...s, label: s.label || (s.kind === "exam" ? EXAMS.find((e) => e.id === s.ref)?.name ?? s.ref : s.ref) }));
}

/**
 * Accept an id or a pasted Unacademy URL and return the id for that share kind.
 *   exam    → goal uid (TMUVD) or exam slug from the built-in list
 *   teacher → username (unacademy.com/@name)
 *   course  → uid (…/course/<slug>/<UID>)
 *   batch   → uid (…/batch/<slug>/<UID>)
 *   lesson  → replay id or class uid (…/lesson/<slug>/<ID>)
 */
export function parseShareRef(kind: S.ShareKind, raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let path = text;
  try {
    if (/^https?:\/\//i.test(text)) path = new URL(text).pathname;
  } catch {
    return null;
  }
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? text;
  if (kind === "teacher") {
    const at = parts.find((p) => p.startsWith("@"));
    const name = (at ? at.slice(1) : parts[0] === "teacher" ? parts[1] ?? "" : last).replace(/^@/, "");
    return name && /^[\w.@+-]{2,80}$/.test(name) ? name.toLowerCase() : null;
  }
  if (kind === "exam") {
    const upper = last.toUpperCase();
    const byId = EXAMS.find((e) => e.id === upper);
    if (byId) return byId.id;
    const bySlug = EXAMS.find((e) => e.slug === last.toLowerCase());
    if (bySlug) return bySlug.id;
    const goal = parts.indexOf("goal");
    if (goal >= 0 && parts[goal + 2]) return parts[goal + 2]!.toUpperCase();
    return /^[A-Z0-9]{4,12}$/.test(upper) ? upper : null;
  }
  return /^[A-Za-z0-9_-]{4,40}$/.test(last) ? last : null;
}
