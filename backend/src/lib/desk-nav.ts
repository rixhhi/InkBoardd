/** Canonical Desk chrome. Shared so tests lock the five destinations. */

export type DeskItemId = "home" | "live" | "library" | "planner" | "saves";

export type DeskItem = {
  id: DeskItemId;
  label: string;
  match: (pathname: string) => boolean;
};

export const DESK_ITEMS: DeskItem[] = [
  {
    id: "home",
    label: "Home",
    match: (p) => p === "/" || p.startsWith("/exam/"),
  },
  {
    id: "live",
    label: "Live",
    match: (p) => p.startsWith("/live/"),
  },
  {
    id: "library",
    label: "Library",
    match: (p) => p.startsWith("/search") || p.startsWith("/teacher/") || p.startsWith("/course/") || p.startsWith("/batch/"),
  },
  {
    id: "planner",
    label: "Planner",
    match: (p) => p === "/planner" || p.startsWith("/planner/"),
  },
  {
    id: "saves",
    label: "Saves",
    match: (p) => p === "/offline" || p.startsWith("/offline/"),
  },
];

export function deskActive(pathname: string): DeskItemId | null {
  if (pathname.startsWith("/play/") || pathname.startsWith("/live/") || pathname === "/offline" || pathname.startsWith("/offline/")) {
    if (pathname.startsWith("/live/")) return "live";
    if (pathname === "/offline" || pathname.startsWith("/offline/")) return "saves";
    return null;
  }
  const hit = DESK_ITEMS.find((item) => item.match(pathname));
  return hit?.id ?? null;
}
