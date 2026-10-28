/** Name/username match for teacher search. Bio and topic tags are not a match. */
export function educatorMatchesQuery(name: string, username: string, q: string) {
  const needle = q.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, " ");
  if (needle.length < 2) return false;
  const n = name.trim().toLowerCase();
  const u = username.trim().toLowerCase().replace(/^@+/, "");
  if (!n && !u) return false;
  const compactQ = needle.replace(/[^a-z0-9]/g, "");
  const compactN = n.replace(/[^a-z0-9]/g, "");
  const compactU = u.replace(/[^a-z0-9]/g, "");
  if (u === needle || n === needle || compactU === compactQ) return true;
  if (u.startsWith(needle) || n.startsWith(needle)) return true;
  if (compactU.startsWith(compactQ) || compactN.startsWith(compactQ)) return true;
  if (n.split(/\s+/).some((w) => w.startsWith(needle))) return true;
  if (u.includes(needle) || n.includes(needle) || compactU.includes(compactQ)) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const words = n.split(/\s+/).filter(Boolean);
    let i = 0;
    for (const w of words) {
      if (w.startsWith(tokens[i]!)) i += 1;
      if (i >= tokens.length) return true;
    }
    const first = tokens[0]!;
    const last = tokens[tokens.length - 1]!;
    if (words[0]?.startsWith(first) && words[words.length - 1]?.startsWith(last)) return true;
  }
  return false;
}

/** "hindi by chandan sharma" → "Chandan Sharma" when it matches the query. */
export function namesFromKeywordLabels(labels: string[], q: string) {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    const m = String(label || "")
      .trim()
      .match(/\bby\s+(.+)$/i);
    if (!m) continue;
    const name = m[1]!.replace(/\s+/g, " ").trim();
    if (!educatorMatchesQuery(name, "", q)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export type AutoUser = {
  username: string;
  uid: string;
  name: string;
  avatar: string;
  followers: number;
  courseCount: number;
};

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickNode(row: unknown): Record<string, unknown> {
  const r = rec(row);
  const details = rec(r.details);
  const data = rec(r.data);
  const value = rec(r.value);
  const author = rec(data.author).username ? rec(data.author) : rec(value.author).username ? rec(value.author) : rec(r.author);
  const stats = rec(data.stats);
  if (str(data.username) || str(stats.username) || str(data.first_name) || str(data.firstName)) return data;
  if (str(value.username) || str(rec(value.stats).username) || str(value.first_name) || str(value.firstName)) return value;
  if (str(author.username) || str(author.first_name)) return author;
  if (str(details.username)) return { ...details, name: str(r.label) || str(details.name) };
  if (str(r.username)) return r;
  return {};
}

export function userFromUnknown(row: unknown): AutoUser | null {
  const node = pickNode(row);
  const stats = rec(node.stats);
  const username = str(node.username || stats.username);
  if (!username) return null;
  const first = str(node.first_name || node.firstName);
  const last = str(node.last_name || node.lastName);
  const name = str(node.name) || `${first} ${last}`.trim() || username;
  return {
    username,
    uid: str(node.uid || stats.uid),
    name,
    avatar: str(node.avatar_v2 || node.avatar_v1 || node.old_avatar || node.avatar),
    followers: num(node.followers_count ?? node.followersCount ?? node.followers ?? stats.followers),
    courseCount: num(node.courses_count ?? node.coursesCount ?? node.courses ?? stats.courses),
  };
}

function collectUsers(rows: unknown[]): AutoUser[] {
  const hits: AutoUser[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const hit = userFromUnknown(row);
    if (!hit) continue;
    const key = hit.username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(hit);
  }
  return hits;
}

export function usersFromAutocomplete(rows: unknown[]): AutoUser[] {
  return collectUsers(rows.filter((row) => str(rec(row).type) === "user" || str(rec(rec(row).details).username)));
}

/** Unacademy search_v3 educator listing rows (`results[].data` or collection `author`). */
export function usersFromListing(results: unknown[]): AutoUser[] {
  return collectUsers(results);
}

/** search_v3/search `users` array. */
export function usersFromSearchV3(users: unknown[]): AutoUser[] {
  return collectUsers(users);
}

export const EDUCATOR_LISTING_PAGES = 12;
export const EDUCATOR_LISTING_PAGE_SIZE = 10;

export function educatorListingUrl(q: string, offset = 0) {
  const filters = encodeURIComponent(JSON.stringify({ entity_type: { id: "educators" } }));
  return `https://unacademy.com/api/v1/search_v3/search/listing/?q=${encodeURIComponent(q)}&filters_applied=${filters}&offset=${offset}`;
}

export function educatorListingOffsets(pages = EDUCATOR_LISTING_PAGES) {
  return Array.from({ length: pages }, (_, i) => i * EDUCATOR_LISTING_PAGE_SIZE);
}

export function searchV3Url(q: string) {
  return `https://unacademy.com/api/v1/search_v3/search/?q=${encodeURIComponent(q)}`;
}

export function listingNextUrl(next: unknown, q: string, fallbackOffset: number): string | null {
  if (typeof next === "string" && /^https?:\/\//i.test(next)) return next;
  if (typeof next === "string" && next.startsWith("/")) return `https://unacademy.com${next}`;
  if (next) return educatorListingUrl(q, fallbackOffset);
  return null;
}

/** From "Chandan Kumar Jha" + query "chandan" → "chandan jha" so autocomplete can find @ChandanJha-301. */
export function extraNameQueries(q: string, users: { name: string }[]): string[] {
  const needle = q.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, " ");
  if (needle.length < 2 || /\s/.test(needle)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of users) {
    const words = u.name.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) continue;
    const first = words[0]!.toLowerCase();
    const last = words[words.length - 1]!.toLowerCase();
    if (!first.startsWith(needle) && !words.some((w) => w.toLowerCase().startsWith(needle))) continue;
    if (last.length < 2 || last === needle) continue;
    const phrase = `${needle} ${last}`;
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(phrase);
    if (out.length >= 10) break;
  }
  return out;
}

