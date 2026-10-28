export function isReplayId(raw: string): boolean {
  const t = raw.trim();
  if (/lesson-raw\/([A-Za-z0-9_-]{10,40})/.test(t)) return true;
  if (/[?&]uid=([A-Za-z0-9_-]{16,40})/.test(t) && /liveweb|replay=true|player\.uacdn/i.test(t)) return true;
  return /^[A-Z0-9]{16,40}$/.test(t);
}

export function extractReplayId(raw: string): string | null {
  const t = raw.trim();
  const lesson = t.match(/lesson-raw\/([A-Za-z0-9_-]{10,40})/);
  if (lesson?.[1]) return lesson[1];
  const slides = t.match(/slides_pdf\/([A-Za-z0-9_-]{10,40})/);
  if (slides?.[1]) return slides[1];
  if (/liveweb|replay=true|player\.uacdn/i.test(t)) {
    const q = t.match(/[?&]uid=([A-Za-z0-9_-]{16,40})/);
    if (q?.[1]) return q[1];
  }
  if (/^[A-Z0-9]{16,40}$/.test(t)) return t;
  return null;
}

/** Unacademy sheldon list APIs are case-sensitive and only match the lowercase handle. */
export function normalizeUsername(raw: string) {
  return raw.trim().replace(/^@+/, "").replace(/^\/+/, "").toLowerCase();
}
