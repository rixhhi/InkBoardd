export function initialsFrom(name?: string | null): string {
  const parts = String(name || "")
    .replace(/[@._/]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const firstPart = parts[0];
  if (!firstPart) return "";
  const first = firstPart.replace(/[^A-Za-z0-9]/g, "");
  if (!first) return "";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const lastPart = parts[parts.length - 1] ?? "";
  const last = lastPart.replace(/[^A-Za-z0-9]/g, "");
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}
