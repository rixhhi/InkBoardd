import { fetchWithRetry } from "@inkboard/shared/fetch-retry";
import { isUnacademyHost } from "@inkboard/shared/cdn-proxy";
import { transportFault, upstreamBad, upstreamNotFound, upstreamRateLimited, upstreamTimeout } from "@inkboard/shared/http-error";
import { noteUpstreamOk } from "@inkboard/shared/upstream";
import { requestDeadline } from "../../lib/deadline.ts";
import { familyBreaker } from "../../lib/breaker.ts";
import type { TopicRef, TopicCovered, UaCourse, ExamCourse } from "./types.ts";
import type { UaLesson } from "@inkboard/shared/parse-lesson";

export function logUa(scope: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[unacademy] ${scope}: ${msg}`);
}
export function onFail<T>(scope: string, fallback: T) {
  return (err: unknown): T => {
    logUa(scope, err);
    return fallback;
  };
}
export const UA_JSON = {
	"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	Accept: "application/json",
	Origin: "https://unacademy.com",
	Referer: "https://unacademy.com/"
};
export const UA_HTML = {
	"User-Agent": UA_JSON["User-Agent"],
	Accept: "text/html,application/xhtml+xml",
	Referer: "https://unacademy.com/"
};
export const SKIP_TOPICS = new Set([
	"Batches and Year Long Courses",
	"Class 11",
	"Class 12",
	"Class 10",
	"Class 9",
	"Class 13",
	"Year Long Course"
]);
export const TTL = 10 * 60 * 1000;
export const FAST_TTL = 90 * 1000;
export let cachedBuildId = "";
export function asObj(v: unknown): Record<string, unknown> {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
export function asStr(v: unknown) {
	return typeof v === "string" ? v : v == null ? "" : String(v);
}
export function asNum(v: unknown) {
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : 0;
}
export function asArr(v: unknown) {
	return Array.isArray(v) ? v : [];
}
export type LessonPage = { lessons: UaLesson[]; nextOffset: number | null; total: number };
export type PlusPage = { courses: ExamCourse[]; total: number; nextOffset: number | null };
export type CourseListPage = { courses: UaCourse[]; total: number; nextOffset: number | null };
export function parseTopic(raw: unknown): TopicRef | null {
	const t = asObj(raw);
	const name = asStr(t.name || t.title);
	const uid = asStr(t.uid);
	if (!name || !uid || SKIP_TOPICS.has(name)) return null;
	const parent = asObj(t.parent);
	const parentName = asStr(parent.name);
	if (parentName && SKIP_TOPICS.has(parentName)) return null;
	return {
		uid,
		name,
		level: asNum(t.level),
		parent: parentName || undefined,
		parentUid: asStr(parent.uid) || undefined
	};
}
export function parseCourse(raw: unknown): UaCourse | null {
	const c = asObj(raw);
	const uid = asStr(c.uid);
	const name = asStr(c.name);
	if (!uid || !name) return null;
	const topics = asArr(c.topic_groups || c.topicGroups).map(parseTopic).filter((t): t is TopicRef => Boolean(t));
	return {
		uid,
		name,
		slug: asStr(c.slug),
		thumbnail: asStr(c.thumbnail_v1 || c.thumbnailV1 || c.thumbnail || c.cover_photo_v1 || c.cover_photo),
		itemCount: asNum(c.item_count ?? c.itemCount ?? c.all_item_count ?? c.allItemCount),
		language: asStr(c.language_display || c.languageDisplay),
		startsAt: asStr(c.starts_at || c.startsAt) || null,
		endsAt: asStr(c.ends_at || c.endsAt) || null,
		viewCount: asNum(c.view_count ?? c.viewCount),
		topics
	};
}
export function aggregateTopics(courses: UaCourse[]): TopicCovered[] {
	const map = new Map<string, TopicCovered>();
	for (const c of courses) for (const t of c.topics) {
		if (t.level !== 15 && t.level !== 30) continue;
		const prev = map.get(t.uid);
		if (prev) prev.courseCount += 1;
		else map.set(t.uid, {
			...t,
			courseCount: 1
		});
	}
	return [...map.values()].sort((a, b) => {
		if (a.level !== b.level) return a.level - b.level;
		return b.courseCount - a.courseCount;
	});
}
function upstreamBudget(timeout: number) {
  const slot = requestDeadline();
  if (slot?.signal.aborted) throw upstreamTimeout();
  const left = slot ? Math.max(1, slot.until - Date.now()) : 18_000;
  return { signal: slot?.signal, timeoutMs: Math.min(timeout, left), budgetMs: Math.min(18_000, left) };
}

function throwStatus(kind: "request" | "page", status: number): never {
  const msg = `Unacademy ${kind} failed (${status})`;
  if (status === 404 || status === 400) throw upstreamNotFound(msg);
  if (status === 429) throw upstreamRateLimited();
  if (status >= 500) throw upstreamBad(status, msg);
  throw upstreamBad(status, msg);
}

function liftTransport(err: unknown): never {
  const mapped = transportFault(err);
  if (mapped) throw mapped;
  throw err;
}

export async function fetchJson(url: string, timeout = 12_000) {
  return familyBreaker("unacademy-api").run(async () => {
    const budget = upstreamBudget(timeout);
    let res: Response;
    try {
      res = await fetchWithRetry(url, {
        headers: UA_JSON,
        timeoutMs: budget.timeoutMs,
        budgetMs: budget.budgetMs,
        signal: budget.signal,
        retries: 2,
        allowed: isUnacademyHost,
      });
    } catch (err) {
      liftTransport(err);
    }
    if (!res.ok) throwStatus("request", res.status);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw upstreamBad(502);
    }
    noteUpstreamOk();
    return body;
  });
}
export async function fetchText(url: string, timeout = 12_000) {
  return familyBreaker("unacademy-html").run(async () => {
    const budget = upstreamBudget(timeout);
    let res: Response;
    try {
      res = await fetchWithRetry(url, {
        headers: UA_HTML,
        timeoutMs: budget.timeoutMs,
        budgetMs: budget.budgetMs,
        signal: budget.signal,
        retries: 2,
        allowed: isUnacademyHost,
      });
    } catch (err) {
      liftTransport(err);
    }
    if (!res.ok) throwStatus("page", res.status);
    let text: string;
    try {
      text = await res.text();
    } catch {
      throw upstreamBad(502);
    }
    noteUpstreamOk();
    return text;
  });
}
export function nextData(html: string): Record<string, unknown> | null {
	const i = html.indexOf("id=\"__NEXT_DATA__\"");
	if (i < 0) return null;
	const gt = html.indexOf(">", i);
	if (gt < 0) return null;
	const end = html.indexOf("</script>", gt);
	if (end < 0) return null;
	try {
		return asObj(JSON.parse(html.slice(gt + 1, end)));
	} catch (err) {
		logUa("nextData.parse", err);
		return null;
	}
}
export function rememberBuildId(nd: Record<string, unknown>) {
	const id = asStr(nd.buildId);
	if (id) cachedBuildId = id;
}
