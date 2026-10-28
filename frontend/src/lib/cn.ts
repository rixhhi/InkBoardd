/** Join class names, dropping falsy values. Small enough that a dependency isn't worth it. */
export function cn(...parts: Array<string | false | null | undefined | 0>): string {
  let out = "";
  for (const p of parts) {
    if (!p) continue;
    out = out ? `${out} ${p}` : p;
  }
  return out;
}
