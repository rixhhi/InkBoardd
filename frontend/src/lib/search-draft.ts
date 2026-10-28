/** What the URL query should become after a debounced edit. Null means leave it. */
export function nextSearchQuery(draft: string, current: string): string | null {
  const next = draft.trim();
  const prev = current.trim();
  if (next === prev) return null;
  if (next.length < 2) return prev ? "" : null;
  return next;
}
