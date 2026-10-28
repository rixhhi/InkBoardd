/** Public Unacademy test-series catalog. Names and counts only — no quiz player. */

const UID = /^[A-Za-z0-9]{4,16}$/;

export type TestSeries = {
  uid: string;
  name: string;
  slug: string;
  itemCount: number;
  startsAt: string | null;
  endsAt: string | null;
  nextTitle: string | null;
  nextAt: string | null;
  nextUid: string | null;
};

export type TestItem = {
  uid: string;
  title: string;
  slug: string;
  rank: number;
  questions: number;
  durationSec: number;
  startAt: string | null;
  type: string;
};

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asStr(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseTestSeries(raw: unknown): TestSeries | null {
  const r = asObj(raw);
  const uid = asStr(r.uid);
  const name = asStr(r.name);
  if (!UID.test(uid) || !name) return null;
  const next = asObj(r.next_session);
  const props = asObj(next.properties);
  return {
    uid,
    name,
    slug: asStr(r.slug),
    itemCount: Math.max(0, Math.trunc(asNum(r.item_count ?? r.itemCount ?? r.quizCount))),
    startsAt: asStr(r.starts_at || r.startsAt) || null,
    endsAt: asStr(r.ends_at || r.endsAt) || null,
    nextTitle: asStr(props.title) || null,
    nextAt: asStr(props.start_time || props.startTime) || asStr(next.start_time) || null,
    nextUid: asStr(props.uid) || null,
  };
}

export function parseTestItem(raw: unknown): TestItem | null {
  const r = asObj(raw);
  const props = asObj(r.properties);
  const uid = asStr(props.uid || r.uid);
  const title = asStr(props.title || r.title);
  if (!UID.test(uid) || !title) return null;
  return {
    uid,
    title,
    slug: asStr(props.slug || r.slug),
    rank: Math.max(0, Math.trunc(asNum(r.rank ?? r.content_type_item_rank))),
    questions: Math.max(0, Math.trunc(asNum(props.num_questions ?? props.numQuestions))),
    durationSec: Math.max(0, Math.trunc(asNum(props.duration))),
    startAt: asStr(props.start_time || props.startTime) || null,
    type: asStr(r.type) || "quiz",
  };
}

export function parseTestSeriesPage(raw: unknown): TestSeries[] {
  const rows = Array.isArray(raw) ? raw : Array.isArray(asObj(raw).results) ? (asObj(raw).results as unknown[]) : [];
  const out: TestSeries[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const s = parseTestSeries(row);
    if (!s || seen.has(s.uid)) continue;
    seen.add(s.uid);
    out.push(s);
  }
  return out;
}

export function parseTestItemPage(raw: unknown): { items: TestItem[]; nextOffset: number | null; total: number } {
  const body = asObj(raw);
  const rows = Array.isArray(raw) ? raw : Array.isArray(body.results) ? (body.results as unknown[]) : [];
  const items = rows.map(parseTestItem).filter((x): x is TestItem => Boolean(x));
  const nextUrl = asStr(body.next);
  let nextOffset: number | null = null;
  if (nextUrl) {
    try {
      const n = Number(new URL(nextUrl).searchParams.get("offset"));
      if (Number.isFinite(n) && n > 0) nextOffset = n;
    } catch {
      nextOffset = items.length || null;
    }
  }
  return { items, nextOffset, total: Math.max(asNum(body.count), items.length) };
}

/** Drop "by Unacademy" / trailing "Test Series" so the line stays short. */
export function seriesShortName(name: string) {
  const trimmed = name
    .replace(/\s+by\s+Unacademy\s*$/i, "")
    .replace(/\s+Test Series\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return trimmed || name;
}

export function seriesCaption(s: TestSeries) {
  const n = s.itemCount;
  const tests = n === 1 ? "1 test" : `${n} tests`;
  return n > 0 ? tests : "On this wall";
}

export function testsPlateCaption(count: number) {
  if (count <= 0) return "On this wall";
  return count === 1 ? "1 series" : `${count} series`;
}

export function minutesFromSec(sec: number) {
  if (!(sec > 0)) return 60;
  return Math.max(1, Math.round(sec / 60));
}

export function durationCaption(sec: number) {
  const m = minutesFromSec(sec);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

export function quizCaption(item: TestItem) {
  const bits: string[] = [];
  if (item.questions > 0) bits.push(`${item.questions} Q`);
  if (item.durationSec > 0) bits.push(durationCaption(item.durationSec));
  return bits.join(" · ");
}

/** IST calendar day of a sitting, or today if the slot already passed. */
export function sittingDate(iso: string | null | undefined, today: string) {
  if (!iso) return today;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return today;
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return key >= today ? key : today;
}

export function testSeriesListUrl(goalUid: string) {
  return `https://api-frontend.unacademy.com/api/v1/uplus/subscription/test_series/?goal_uid=${encodeURIComponent(goalUid)}&limit=20&type=1`;
}

export function testSeriesItemsUrl(uid: string, offset = 0) {
  const q = offset > 0 ? `?limit=20&offset=${offset}` : "?limit=20";
  return `https://api-frontend.unacademy.com/api/v1/uplus/programmes/${encodeURIComponent(uid)}/items/${q}`;
}
