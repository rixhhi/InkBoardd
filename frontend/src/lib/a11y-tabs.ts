/** Next tab id for arrow, Home, and End. Returns null when the key is not a tab move. */
export function moveTab(ids: readonly string[], current: string, key: string): string | null {
  if (!ids.length) return null;
  const index = Math.max(0, ids.indexOf(current));
  if (key === "ArrowRight" || key === "ArrowDown") return ids[(index + 1) % ids.length] ?? null;
  if (key === "ArrowLeft" || key === "ArrowUp") return ids[(index - 1 + ids.length) % ids.length] ?? null;
  if (key === "Home") return ids[0] ?? null;
  if (key === "End") return ids[ids.length - 1] ?? null;
  return null;
}
