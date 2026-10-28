export type StorageLevel = "ok" | "warn" | "full";

/** Warn at 90% of the origin quota, and stop at the quota. */
export function storagePressure(used: number, quota: number): StorageLevel {
  if (!(quota > 0) || !(used >= 0)) return "ok";
  if (used >= quota) return "full";
  if (used / quota >= 0.9) return "warn";
  return "ok";
}

export function storageCopy(level: StorageLevel): string | null {
  if (level === "full") return "This device is full. Remove a saved lecture before downloading another.";
  if (level === "warn") return "This device is almost full.";
  return null;
}
