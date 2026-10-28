/** Single-letter planner shortcuts must not fire on /play or /live. */
export function plannerShortcutsActive(pathname: string) {
  return pathname === "/planner" || pathname.startsWith("/planner/");
}
