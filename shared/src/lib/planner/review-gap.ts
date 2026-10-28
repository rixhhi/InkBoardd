export type Recall = "shaky" | "ok" | "solid";

/** Days until the next review. Shaky always comes back tomorrow. Solid waits longer than ok. */
export function nextIntervalDays(previous: number, rating: Recall): number {
  const base = Number.isFinite(previous) && previous > 0 ? Math.round(previous) : 1;
  if (rating === "shaky") return 1;
  if (rating === "ok") return Math.max(1, Math.round(base * 1.5));
  return base * 2 + 1;
}
