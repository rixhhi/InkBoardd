/**
 * Who is signed in, and the small JSON helpers the account screens use.
 *
 * The API owns every decision (see backend/src/auth/guard.ts). This file only
 * mirrors it so the UI can hide what a member cannot open anyway.
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError, apiJson } from "@/lib/api-client";

export type Role = "superadmin" | "admin" | "member";
export type Audience = "all" | "group" | "user";
export type ShareKind = "exam" | "teacher" | "course" | "batch" | "lesson";

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  status: "active" | "disabled";
  mustChangePassword?: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  /** Member pressed "Forgot your password?"; cleared when an admin resets it. */
  resetRequestedAt?: string | null;
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
  createdBy?: number | null;
};
export type Permissions = { live: boolean; planner: boolean; downloads: boolean; search: boolean; browse: boolean };
export type AccessMode = "curated" | "open";

export type AuthStatus = { needsSetup: boolean; user: SessionUser | null };
export type Me = { user: SessionUser; accessMode: AccessMode; permissions: Permissions; shares: Share[] };

export const AUTH_KEY = ["auth", "status"] as const;
export const ME_KEY = ["auth", "me"] as const;

/** JSON request with a body. Same-origin, so the HttpOnly session cookie rides along. */
export function sendJson<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  return apiJson<T>(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
}

export function useAuthStatus() {
  return useQuery({
    queryKey: AUTH_KEY,
    queryFn: () => apiJson<AuthStatus>("/api/auth/status", { credentials: "same-origin" }),
    staleTime: 60_000,
    retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 3,
  });
}

/** Profile, access mode, feature switches and shares for the signed-in person. */
export function useMe(enabled = true) {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => apiJson<Me>("/api/me", { credentials: "same-origin" }),
    enabled,
    staleTime: 60_000,
    retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2,
  });
}

export function useCurrentUser(): SessionUser | null {
  return useAuthStatus().data?.user ?? null;
}

/** Admins and the super admin. */
export function isStaffRole(role: Role | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

export function roleLabel(role: Role | null | undefined): string {
  return role === "superadmin" ? "Super admin" : role === "admin" ? "Admin" : "Member";
}

export function useIsAdmin(): boolean {
  return isStaffRole(useCurrentUser()?.role);
}

export function useIsSuperAdmin(): boolean {
  return useCurrentUser()?.role === "superadmin";
}

const ALL_ON: Permissions = { live: true, planner: true, downloads: true, search: true, browse: true };
const MEMBER_DEFAULT: Permissions = { live: true, planner: true, downloads: false, search: false, browse: false };

/**
 * What a member can reach, mirrored from the API rules:
 *  - open mode: browse + search on
 *  - live: switched on AND at least one exam shared (open mode skips the exam need)
 */
export function effectivePerms(input: { staff: boolean; open: boolean; perms: Permissions | null | undefined; shares: Pick<Share, "kind">[] }): Permissions {
  if (input.staff) return ALL_ON;
  const p = input.perms ?? MEMBER_DEFAULT;
  const hasExam = input.shares.some((s) => s.kind === "exam");
  return {
    ...p,
    search: p.search || input.open,
    browse: p.browse || input.open,
    live: p.live && (input.open || hasExam),
  };
}

/**
 * What a member may see in the chrome. Admins and open mode see everything.
 * `exams` is null when every exam is allowed.
 */
export function useAccess() {
  const user = useCurrentUser();
  const me = useMe(Boolean(user));
  const admin = isStaffRole(user?.role);
  const open = me.data?.accessMode === "open";
  const shares = me.data?.shares ?? [];
  const perms = effectivePerms({ staff: admin, open, perms: me.data?.permissions, shares });
  const exams = admin || open || !me.data ? null : new Set(shares.filter((s) => s.kind === "exam").map((s) => s.ref));
  return { user, admin, superadmin: user?.role === "superadmin", open, perms, exams, shares, ready: Boolean(admin || me.data) };
}

export async function signOut(qc: QueryClient) {
  try {
    const { stopAccountSync } = await import("@/lib/account-sync");
    await stopAccountSync();
  } catch {
    /* keep signing out */
  }
  try {
    await sendJson("/api/auth/logout", "POST");
  } catch {
    /* already signed out */
  }
  qc.clear();
  window.location.assign("/login");
}

/** Fired by the API client on a 401 so the gate can send the person to /login. */
export const AUTH_LOST_EVENT = "inkboard:auth-lost";

export function useOnAuthLost(onLost: () => void) {
  const qc = useQueryClient();
  const cb = useRef(onLost);
  cb.current = onLost;
  useEffect(() => {
    const handler = () => {
      void qc.invalidateQueries({ queryKey: AUTH_KEY });
      cb.current();
    };
    window.addEventListener(AUTH_LOST_EVENT, handler);
    return () => window.removeEventListener(AUTH_LOST_EVENT, handler);
  }, [qc]);
}

/* ---------------- activity beacons ---------------- */

function beacon(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.("/api/activity", new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* fall through to fetch */
  }
  void fetch("/api/activity", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {});
}

/**
 * Report watched seconds to the admin's activity view. Counts only while the
 * video is actually playing and the tab is visible; flushes every minute, on
 * pause, on tab hide and when the player closes.
 */
export function useWatchBeacon(lessonId: string, title: string, playing: boolean) {
  const acc = useRef(0);
  const last = useRef<number | null>(null);
  const meta = useRef({ lessonId, title });
  meta.current = { lessonId, title };

  useEffect(() => {
    const flush = () => {
      if (last.current != null) {
        acc.current += (performance.now() - last.current) / 1000;
        last.current = performance.now();
      }
      const seconds = Math.round(acc.current);
      if (seconds < 5) return;
      acc.current = 0;
      beacon({ kind: "watch", ref: meta.current.lessonId, label: meta.current.title, seconds, path: location.pathname });
    };
    if (!playing) {
      if (last.current != null) acc.current += (performance.now() - last.current) / 1000;
      last.current = null;
      flush();
      return;
    }
    last.current = document.hidden ? null : performance.now();
    const onVis = () => {
      if (document.hidden) {
        if (last.current != null) acc.current += (performance.now() - last.current) / 1000;
        last.current = null;
        flush();
      } else {
        last.current = performance.now();
      }
    };
    const timer = window.setInterval(flush, 60_000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
      flush();
      last.current = null;
    };
  }, [playing, lessonId]);
}

/* ---------------- formatting ---------------- */

export function fmtMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 30 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export const SHARE_KIND_LABEL: Record<ShareKind, string> = {
  exam: "Exam",
  teacher: "Teacher",
  course: "Course",
  batch: "Batch",
  lesson: "Class",
};

/** Where a share opens in the app. */
export function shareHref(s: Pick<Share, "kind" | "ref" | "label">): { to: string; params?: Record<string, string>; search?: Record<string, string> } {
  switch (s.kind) {
    case "exam":
      return { to: "/exam/$goalId", params: { goalId: s.ref } };
    case "teacher":
      return { to: "/teacher/$slug", params: { slug: s.ref } };
    case "course":
      return { to: "/course/$courseId", params: { courseId: s.ref } };
    case "batch":
      return { to: "/batch/$batchId", params: { batchId: s.ref } };
    default:
      return { to: "/play/$lessonId", params: { lessonId: s.ref }, search: s.label ? { title: s.label } : {} };
  }
}

/**
 * Where "back to the catalog" goes for this person: Browse when they may browse,
 * otherwise their dashboard (members in curated mode never see Browse).
 */
export function catalogRoot(canBrowse: boolean): { to: "/browse" | "/"; label: string; back: string } {
  return canBrowse ? { to: "/browse", label: "Browse", back: "All exams" } : { to: "/", label: "Home", back: "Your dashboard" };
}

export function useCatalogRoot() {
  return catalogRoot(useAccess().perms.browse);
}
