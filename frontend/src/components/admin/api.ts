/** Types, query keys and fetch helpers for the admin screens. */
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api-client";
import type { AccessMode, Permissions, SessionUser, Share } from "@/lib/session";
import type { InkItem } from "@inkboard/shared/planner/ink";
import type { ActivityItem } from "./bits";

export type Stats = { userId: number; watchSeconds7d: number; watchSeconds30d: number; lessons7d: number; activeDays30d: number; lastActivityAt: string | null };
export type MemberRow = SessionUser & { stats: Stats | null; groupIds?: number[] };
export type Group = { id: number; name: string; description: string; createdAt: string; memberIds: number[]; shareCount?: number };
export type Online = { userId: number; at: string; kind: string; label: string; ref: string; name?: string; user?: { name: string; email: string } | null };
export type Lesson = { ref: string; label: string; seconds: number; lastDay: string };
export type PlannerSummary = {
  planName: string;
  examName: string;
  tasksTotal: number;
  tasksDone: number;
  todayTotal: number;
  todayDone: number;
  minutes7d: number;
  updatedAt: string;
  examDate: string | null;
  ink: InkItem[];
} | null;

export type Overview = {
  counts: { members: number; active: number; activeThisWeek: number; onlineNow: number; shares: number; groups: number; watchSeconds7d: number; resetRequests?: number };
  daily: { day: string; seconds: number }[];
  topLessons: { ref: string; label: string; members: number; seconds: number }[];
  online: Online[];
  members: MemberRow[];
  recent: ActivityItem[];
  accessMode: AccessMode;
  activityWindowMinutes: number;
};

export type MemberDetail = {
  member: SessionUser;
  stats: Stats | null;
  daily: { day: string; seconds: number }[];
  activity: ActivityItem[];
  shares: Share[];
  effectiveShares: Share[];
  groups: { id: number; name: string }[];
  planner: PlannerSummary;
  lessons: Lesson[];
};

export type AuditItem = { id: number; actorId: number | null; actorName: string; at: string; action: string; target: string; detail: string };
export type Settings = { accessMode: AccessMode; permissions: Permissions };

export const get = <T,>(path: string) => apiJson<T>(path, { credentials: "same-origin" });

export const ADMIN_KEY = ["admin"] as const;

export function useMembers(enabled = true) {
  return useQuery({ queryKey: ["admin", "members"], queryFn: () => get<{ members: MemberRow[] }>("/api/admin/members"), enabled, staleTime: 30_000 });
}

export function useGroups(enabled = true) {
  return useQuery({ queryKey: ["admin", "groups"], queryFn: () => get<{ groups: Group[] }>("/api/admin/groups"), enabled, staleTime: 30_000 });
}

export function useSettings() {
  return useQuery({ queryKey: ["admin", "settings"], queryFn: () => get<Settings>("/api/admin/settings") });
}

/** "Mar 4" or "Mar 4, 2027" when not this year. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Where a share stands right now. */
export function shareWindow(s: Pick<Share, "startsAt" | "expiresAt">, now = Date.now()): "scheduled" | "active" | "expired" {
  if (s.startsAt && Date.parse(s.startsAt) > now) return "scheduled";
  if (s.expiresAt && Date.parse(s.expiresAt) <= now) return "expired";
  return "active";
}

/** `<input type="date">` value ⇄ ISO. A start is the beginning of that day; an end is the end of it. */
export function dateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoFromDateInput(value: string, edge: "start" | "end"): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const at = edge === "start" ? new Date(y, m - 1, d, 0, 0, 0) : new Date(y, m - 1, d, 23, 59, 59);
  return at.toISOString();
}

/** Human line for an audit entry. */
export const AUDIT_LABEL: Record<string, string> = {
  setup: "Set up InkBoard",
  password: "Changed own password",
  "member.add": "Added member",
  "member.edit": "Edited member",
  "member.remove": "Removed member",
  "member.signout": "Signed out member",
  "admin.add": "Added admin",
  "admin.promote": "Made admin",
  "admin.demote": "Removed admin rights",
  "admin.edit": "Edited admin",
  "admin.remove": "Removed admin",
  "group.add": "Created group",
  "group.edit": "Edited group",
  "group.remove": "Deleted group",
  "share.add": "Shared",
  "share.edit": "Edited share",
  "share.remove": "Unshared",
  settings: "Changed settings",
};
