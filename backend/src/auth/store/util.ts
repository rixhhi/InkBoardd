export function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return typeof v === "string" ? new Date(v).toISOString() : "";
}

export function isoOrNull(v: unknown): string | null {
  return v == null ? null : iso(v);
}

export function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}
