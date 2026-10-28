import type { LucideIcon } from "lucide-react";
import { CalendarDays, Compass, House, Library, Radio, ShieldCheck } from "lucide-react";

/** The five primary destinations. Same list drives the sidebar and the phone tab bar. */
export type NavId = "home" | "browse" | "library" | "live" | "planner" | "admin";

export type NavItem = {
  id: NavId;
  label: string;
  icon: LucideIcon;
  to: string;
  match: (pathname: string) => boolean;
  /** Which member feature switch hides this item (admins always see it). */
  feature?: "live" | "planner" | "browse";
  /** Only the admin sees it. */
  adminOnly?: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", label: "Home", icon: House, to: "/", match: (p) => p === "/" },
  {
    id: "browse",
    label: "Browse",
    icon: Compass,
    to: "/browse",
    match: (p) =>
      p.startsWith("/browse") || p.startsWith("/exam/") || p.startsWith("/teacher/") || p.startsWith("/course/") || p.startsWith("/batch/") || p.startsWith("/search"),
    feature: "browse",
  },
  {
    id: "library",
    label: "Library",
    icon: Library,
    to: "/library",
    match: (p) => p.startsWith("/library") || p.startsWith("/favourites") || p.startsWith("/offline"),
  },
  { id: "live", label: "Live", icon: Radio, to: "/live", match: (p) => p === "/live" || p.startsWith("/live/"), feature: "live" },
  { id: "planner", label: "Planner", icon: CalendarDays, to: "/planner/today", match: (p) => p === "/planner" || p.startsWith("/planner/"), feature: "planner" },
  { id: "admin", label: "Admin", icon: ShieldCheck, to: "/admin", match: (p) => p === "/admin" || p.startsWith("/admin/"), adminOnly: true },
];

/**
 * Items this person may see. Members lose Admin and any feature the admin switched off.
 * `live` should already include "an exam is shared" (see effectivePerms in session.ts).
 */
export function visibleNav(opts: { admin: boolean; live: boolean; planner: boolean; browse?: boolean }): NavItem[] {
  return NAV_ITEMS.filter((i) => {
    if (i.adminOnly) return opts.admin;
    if (i.feature && !opts.admin) return Boolean(opts[i.feature]);
    return true;
  });
}

export function navActive(pathname: string): NavId | null {
  if (pathname.startsWith("/play/")) return null;
  return NAV_ITEMS.find((i) => i.match(pathname))?.id ?? null;
}

/** Pages that want the whole viewport (player, live stage). The shell renders no sidebar/tabbar for them. */
export function isImmersive(pathname: string): boolean {
  return pathname.startsWith("/play/") || /^\/live\/[^/]+/.test(pathname);
}

/** Breadcrumb trail for the context bar. Pages can override via PageHeader crumbs. */
export function navTrail(pathname: string): string[] {
  const id = navActive(pathname);
  if (!id) return [];
  const root = NAV_ITEMS.find((i) => i.id === id)!.label;
  if (pathname.startsWith("/exam/")) return [root, "Exam"];
  if (pathname.startsWith("/teacher/")) return [root, "Teacher"];
  if (pathname.startsWith("/course/")) return [root, "Course"];
  if (pathname.startsWith("/batch/")) return [root, "Batch"];
  if (pathname.startsWith("/search")) return [root, "Search"];
  if (pathname.startsWith("/admin")) return [root];
  return [root];
}
