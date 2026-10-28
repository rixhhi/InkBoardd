import { parseAtUser } from "./jump.ts";
import { normalizeUsername } from "./unacademy-ids.ts";

const PROFILE = /(?:https?:\/\/)?(?:www\.)?unacademy\.com\/@([A-Za-z][A-Za-z0-9._-]{1,39})/i;
const BARE_USER = /^[A-Za-z][A-Za-z0-9._-]{1,39}$/;

/** @handle or a pasted Unacademy profile URL — never a bare subject word. */
export function usernameFromQuery(raw: string): string {
  const t = raw.trim();
  const at = parseAtUser(t);
  if (at) return at;
  const m = t.match(PROFILE);
  return m?.[1] ?? "";
}

/** After a search returns no hits, a single handle-shaped token may be a username. */
export function usernameIfNoHits(raw: string, hitCount: number): string {
  if (hitCount > 0) return "";
  if (usernameFromQuery(raw)) return usernameFromQuery(raw);
  const t = raw.trim();
  if (/\s/.test(t)) return "";
  const u = normalizeUsername(t);
  return BARE_USER.test(u) ? u : "";
}
