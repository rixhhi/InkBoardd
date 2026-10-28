export function uid(prefix = "p"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

export function makeIdFactory(prefix = "t"): () => string {
  let n = 0;
  return () => `${prefix}_${++n}`;
}
