/** Canonical Desk chrome. Tests lock the destinations. */

export type DeskItemId = "home" | "library" | "planner" | "saves";

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
    id: "library",
    label: "Library",
    match: (p) =>
      p.startsWith("/search") || p.startsWith("/teacher/") || p.startsWith("/course/") || p.startsWith("/batch/"),
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
  if (pathname.startsWith("/play/")) return null;
  const hit = DESK_ITEMS.find((item) => item.match(pathname));
  return hit?.id ?? null;
}
