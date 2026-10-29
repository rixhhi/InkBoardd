import { env } from "../../config/env.ts";

export type Role = "superadmin" | "admin" | "member";
export type UserStatus = "active" | "disabled";
export type ShareKind = "exam" | "teacher" | "course" | "batch" | "lesson";
export type Audience = "all" | "group" | "user";
export type AccessMode = "curated" | "open";

export type User = {
  id: number;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  /** Set by "Forgot your password?" on the sign-in page; cleared by an admin reset. */
  resetRequestedAt: string | null;
};

export type Share = {
  id: number;
  kind: ShareKind;
  ref: string;
  label: string;
  note: string;
  audience: Audience;
  userId: number | null;
  groupId: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  pinned: boolean;
  createdAt: string;
  createdBy: number | null;
};

export type Group = { id: number; name: string; description: string; createdAt: string; memberIds: number[] };

export type Activity = { id: number; userId: number; at: string; kind: string; ref: string; label: string; path: string; seconds: number };

export type MemberPermissions = { live: boolean; planner: boolean; downloads: boolean; search: boolean; browse: boolean };

export const SESSION_DAYS = 30;
const SHARE_KINDS: readonly ShareKind[] = ["exam", "teacher", "course", "batch", "lesson"];
export const ACTIVITY_KEEP_MINUTES = 60;

export function isShareKind(v: unknown): v is ShareKind {
  return typeof v === "string" && (SHARE_KINDS as readonly string[]).includes(v);
}

export function isStaff(role: Role | undefined | null): boolean {
  return role === "admin" || role === "superadmin";
}

/** Time zone for "per day" charts. Unacademy's audience is in India. */
export function statsTz(): string {
  return env("STATS_TZ") || "Asia/Kolkata";
}
