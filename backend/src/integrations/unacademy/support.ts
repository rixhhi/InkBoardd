
import { getExam, } from "@inkboard/shared/exams";
import { studioAvatar } from "@inkboard/shared/media-cover";
import {
  lessonStatus,
  pickReplayId,
} from "@inkboard/shared/parse-lesson";
import type {
  UaCourse,
  ExamTeacher,
  ExamPlaylist,
  ExamSubject,
  ExamCourse,
  UaBatch,
  BatchSession,
  ClassDetail,
  LiveSlot,
} from "./types.ts";
import {
  asArr,
  asNum,
  asObj,
  asStr,
  fetchJson,
  logUa,
  onFail,
  type PlusPage,
} from "./http.ts";
import { loadCourses } from "./course-load.ts";

export {
  asArr,
  asNum,
  asObj,
  asStr,
  cachedBuildId,
  FAST_TTL,
  fetchJson,
  fetchText,
  logUa,
  nextData,
  onFail,
  rememberBuildId,
  SKIP_TOPICS,
  TTL,
  UA_HTML,
  UA_JSON,
  aggregateTopics,
  parseCourse,
  parseTopic,
  type CourseListPage,
  type LessonPage,
  type PlusPage,
} from "./http.ts";
export {
  loadCollectionPage,
  loadCoursePageProps,
  loadCourses,
  loadCoursesFromHtml,
  loadLessonPages,
  loadProfile,
  loadRelatedReplays,
  loadTeacherCoursePages,
  replayFromCourseLessons,
} from "./course-load.ts";

export function parseExamTeacher(raw: unknown): ExamTeacher | null {
	const v = asObj(raw);
	const username = asStr(v.username);
	if (!username) return null;
	const first = asStr(v.first_name || v.firstName);
	const last = asStr(v.last_name || v.lastName);
	const rawRank = v.leaderboard_rank ?? v.leaderboardRank;
	let rank = null;
	if (rawRank != null && rawRank !== "") {
		const n = asNum(rawRank);
		rank = n > 0 ? n : null;
	}
	return {
		username,
		uid: asStr(v.uid),
		name: `${first} ${last}`.trim() || username,
		bio: asStr(v.bio),
		avatar: studioAvatar(v.avatar_v2, v.avatarV2, v.avatar_v1_web, v.avatar_v1, v.old_avatar, v.avatar),
		followers: asNum(v.followers_count ?? v.followersCount ?? v.followers),
		topics: asStr(v.topics_display || v.topicsDisplay || asObj(v.topic).name),
		rank
	};
}
export async function resolveCourseRef(uid: string, slug?: string, teacher?: string) {
	try {
		const col = asObj(await fetchJson(`https://api.unacademy.com/api/v1/collection/${encodeURIComponent(uid)}/`, 8000));
		const id = asStr(col.uid);
		const name = asStr(col.name);
		const items = asNum(col.item_count ?? col.itemCount ?? col.all_item_count);
		if (id && name && items >= 1) return { uid: id, slug: asStr(col.slug) || slug };
	} catch (err) {
		logUa(`collection.${uid}`, err);
		/* playlist ids 404 here */
	}
	if (teacher) {
		try {
			const page = await loadCourses(teacher, "latest", 0, 40);
			const byId = page.courses.find((c) => c.uid === uid);
			if (byId) return { uid: byId.uid, slug: byId.slug || slug };
			if (slug) {
				const bySlug = page.courses.find((c) => c.slug === slug);
				if (bySlug) return { uid: bySlug.uid, slug: bySlug.slug };
				const hit = bestCourseMatch(slug.replace(/-/g, " "), page.courses);
				if (hit) return { uid: hit.uid, slug: hit.slug };
			}
		} catch (err) {
			logUa(`resolveCourse.teacher.${teacher}`, err);
		}
	}
	return { uid, slug };
}
export function courseSlugOf(row: Record<string, unknown>): string {
	const slug = asStr(row.slug);
	if (slug && !/^[A-Z0-9]{4,16}$/.test(slug)) return slug;
	const m = asStr(row.relative_link || row.relativeLink || row.permalink).match(/\/course\/([^/]+)(?:\/|$)/i);
	return m?.[1] ? decodeURIComponent(m[1]) : slug;
}
export function parseExamPlaylist(raw: unknown): ExamPlaylist | null {
	const v = asObj(raw);
	const uid = asStr(v.uid);
	const name = asStr(v.name || v.title);
	if (!uid || !name) return null;
	const author = asObj(asArr(v.authors)[0]);
	return {
		uid,
		name,
		topic: asStr(v.topic_group_name || v.topicGroupName) || "Course",
		lessonCount: asNum(v.lessons_count ?? v.lessonsCount ?? v.item_count),
		authorName: `${asStr(author.first_name || author.firstName)} ${asStr(author.last_name || author.lastName)}`.trim(),
		authorUsername: asStr(author.username),
		authorAvatar: studioAvatar(author.avatar_v2, author.avatarV2, author.avatar_v1_web, author.old_avatar, author.avatar),
		thumbnail: asStr(v.thumbnail_v1 || v.thumbnailV1 || v.thumbnail || v.cover_photo_v1 || v.coverPhotoV1 || v.cover_photo || v.coverPhoto)
	};
}
export function parseExamSubject(raw: unknown): ExamSubject | null {
	const row = asObj(raw);
	const extra = asObj(row.extra_info || row.extraInfo);
	const name = asStr(extra.label || row.name || row.title);
	const data0 = asObj(asArr(row.data)[0]);
	const uid = asStr(data0.uid || row.uid || extra.uid);
	if (!uid || !name) return null;
	return {
		uid,
		name,
		icon: asStr(data0.icon_url || data0.iconUrl || row.icon_url)
	};
}
export function parseExamCourse(raw: unknown): ExamCourse | null {
	const row = asObj(raw);
	const uid = asStr(row.uid);
	const name = asStr(row.name || row.title);
	if (!uid || !name) return null;
	const author = asObj(row.author || asArr(row.authors)[0]);
	const sess = asObj(asObj(row.next_session || row.nextSession).properties);
	const liveAt = asStr(sess.live_at || sess.liveAt || row.starts_at || row.startsAt) || null;
	const replay = pickReplayId(sess) || pickReplayId(row);
	const topic = asStr(asObj(asArr(row.topic_groups || row.topicGroups)[0]).name) || asStr(row.topic_group_name || row.topicGroupName) || asStr(asObj(row.goal).name) || "Course";
	let status = lessonStatus(replay, liveAt, sess.state == null || sess.state === "" ? asNum(row.state) : asNum(sess.state));
	if (row.is_live === true) status = "live";
	const goal = asObj(row.goal);
	return {
		uid,
		name,
		slug: courseSlugOf(row),
		topic,
		lessonCount: asNum(row.item_count ?? row.lessons_count ?? row.lessonsCount),
		authorName: `${asStr(author.first_name || author.firstName)} ${asStr(author.last_name || author.lastName)}`.trim(),
		authorUsername: asStr(author.username),
		authorAvatar: studioAvatar(author.avatar_v2, author.avatarV2, author.avatar_v1_web, author.avatar_v1, author.avatar),
		thumbnail: asStr(row.thumbnail_v1 || row.thumbnailV1 || row.thumbnail || row.cover_photo_v1 || row.coverPhotoV1 || row.cover_photo || row.coverPhoto),
		liveAt,
		classUid: asStr(sess.uid) || null,
		classSlug: asStr(sess.slug) || null,
		replayId: replay,
		status,
		goalUid: asStr(row.goal_uid || row.goalUid || goal.uid) || undefined,
		goalName: asStr(goal.name || goal.title) || undefined
	};
}
export function nameKey(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function bestCourseMatch(name: string, courses: UaCourse[]): UaCourse | null {
	const n = nameKey(name);
	if (!n) return null;
	let best = null;
	let score = 0;
	for (const c of courses) {
		const m = nameKey(c.name);
		if (!m) continue;
		if (m === n) return c;
		if (m.includes(n) || n.includes(m)) {
			const s = Math.min(m.length, n.length) / Math.max(m.length, n.length);
			if (s > score) {
				score = s;
				best = c;
			}
		}
	}
	return score >= .72 ? best : null;
}
export const playlistMiss = new Set<string>();
export const playlistGate = { inflight: 0 };
export async function loadPlusCourses(goalId: string, offset: number, limit: number): Promise<PlusPage> {
	const payload = asObj(await fetchJson(`https://unacademy.com/api/v1/uplus/subscription/courses/?goal_uid=${encodeURIComponent(goalId)}&limit=${limit}&offset=${offset}`));
	const paper = getExam(goalId);
	const courses = asArr(payload.results).map(parseExamCourse).filter((c): c is ExamCourse => Boolean(c)).map((c) => ({
		...c,
		goalUid: goalId,
		goalName: paper?.name || c.goalName
	}));
	return {
		courses,
		total: asNum(payload.count),
		nextOffset: payload.next ? offset + courses.length : null
	};
}
export function uniqBy<T>(rows: T[], key: (row: T) => string): T[] {
	const seen = new Set<string>();
	return rows.filter((r) => {
		const k = key(r);
		if (!k || seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}
export function mergePlusPages(pages: PlusPage[], _offset: number, _perGoal: number): PlusPage {
  const nexts = pages.map((p) => p.nextOffset).filter((n): n is number => n != null);
  return {
    courses: uniqBy(pages.flatMap((p) => p.courses), (c) => c.uid),
    total: pages.reduce((n, p) => n + p.total, 0),
    nextOffset: nexts.length ? Math.min(...nexts) : null,
  };
}
export async function loadPlusAcross(goals: string[], offset: number, perGoal: number): Promise<PlusPage> {
	const pages = await Promise.all(goals.map((id) => loadPlusCourses(id, offset, perGoal).catch(onFail(`plus.${id}`, {
		courses: [],
		total: 0,
		nextOffset: null
	}))));
	return mergePlusPages(pages, offset, perGoal);
}
export async function loadTopologySubjects(goalId: string): Promise<ExamSubject[]> {
	const raw = await fetchJson(`https://unacademy.com/api/v1/topology/users/${encodeURIComponent(goalId)}/children/?limit=40`, 8e3).catch(onFail("fetch", null));
	const out = [];
	const seen = new Set();
	for (const row of asArr(asObj(raw).results)) {
		const r = asObj(row);
		const uid = asStr(r.uid);
		const name = asStr(r.name || r.title);
		if (!uid || !name) continue;
		if (/\btg\b/i.test(name) && /mechanical tg/i.test(name)) continue;
		const key = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
		const family = /\b(ga|gs|aptitude|mathematics)\b/.test(key) && !/\b(cs|civil|mechanical|chemical)\b/.test(key) ? "aptitude" : key;
		if (seen.has(key) || seen.has(family)) continue;
		seen.add(key);
		seen.add(family);
		out.push({
			uid,
			name: family === "aptitude" ? "General Aptitude & Maths" : name,
			icon: asStr(r.icon || r.plus_icon_url || r.plusIconUrl)
		});
	}
	return out;
}
export function mergeTeachers(primary: ExamTeacher[], extra: ExamTeacher[]): ExamTeacher[] {
	const seen = new Set(primary.map((t) => t.username.toLowerCase()));
	const out = [...primary];
	for (const t of extra) {
		const key = t.username.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(t);
	}
	return out;
}
export function parseBatch(raw: unknown): UaBatch | null {
	const b = asObj(raw);
	const uid = asStr(b.uid);
	const name = asStr(b.name);
	if (!uid || !name) return null;
	const goal = asObj(b.goal);
	const langs = asArr(b.languages);
	const authors = asArr(b.authors).map((a) => {
		const o = asObj(a);
		return {
			name: `${asStr(o.first_name || o.firstName)} ${asStr(o.last_name || o.lastName)}`.trim(),
			username: asStr(o.username),
			avatar: studioAvatar(o.avatar_v2, o.avatarV2, o.avatar_v1_web, o.avatar_v1, o.old_avatar, o.avatar)
		};
	});
	return {
		uid,
		name,
		slug: asStr(b.slug),
		thumbnail: asStr(b.cover_photo_v2 || b.coverPhotoV2 || b.cover_photo || b.coverPhoto),
		startsAt: asStr(b.starts_at || b.startsAt) || null,
		endsAt: asStr(b.completed_at || b.completedAt || b.ends_at) || null,
		goalName: asStr(goal.name || goal.title),
		goalUid: asStr(goal.uid),
		syllabusTag: asStr(b.syllabus_tag || b.syllabusTag),
		language: asStr(asObj(langs[0]).label),
		authors,
		state: asNum(b.state)
	};
}
export function parseBatchSession(raw: unknown): BatchSession | null {
	const row = asObj(raw);
	const p = asObj(row.properties || row);
	const uid = asStr(p.uid);
	const title = asStr(p.name || p.title);
	if (!uid || !title) return null;
	const author = asObj(p.author);
	const programme = asObj(p.programme);
	const liveAt = asStr(p.live_at || p.liveAt || row.live_at) || null;
	const state = asNum(p.state);
	const replay = pickReplayId(p);
	const slugFromRel = asStr(p.relative_link || p.relativeLink).match(/\/class\/([^/]+)\//)?.[1] || "";
	return {
		uid,
		title,
		slug: asStr(p.slug) || slugFromRel,
		liveAt,
		durationSec: asNum(p.video_duration ?? p.videoDuration),
		authorName: `${asStr(author.first_name || author.firstName)} ${asStr(author.last_name || author.lastName)}`.trim(),
		authorUsername: asStr(author.username),
		authorAvatar: studioAvatar(author.avatar_v2, author.avatarV2, author.avatar_v1_web, author.avatar_v1, author.avatar),
		courseUid: asStr(programme.uid),
		courseSlug: asStr(programme.slug),
		courseName: asStr(programme.name),
		status: lessonStatus(replay, liveAt, state),
		rank: asNum(row.rank ?? p.rank),
		replayId: replay
	};
}
export function scheduleCursor(data: Record<string, unknown>, past: boolean): number | null {
	const cursor = asStr(past ? data.previous : data.next);
	if (!cursor) return null;
	if (/[?&]past=True/i.test(cursor) !== past) return null;
	const m = cursor.match(/[?&]rank=(-?\d+)/);
	return m ? Number(m[1]) : null;
}
export async function loadScheduleSlice(batchUid: string, past: boolean, rank: number | undefined = undefined): Promise<{ sessions: BatchSession[]; nextRank: number | null }> {
	const rankQ = rank != null ? `&rank=${rank}` : "";
	const data = asObj(await fetchJson(`https://api-frontend.unacademy.com/api/v1/batch/${encodeURIComponent(batchUid)}/schedule/?limit=16&past=${past ? "True" : "False"}&timezone_difference=0${rankQ}`));
	return {
		sessions: asArr(data.results).map(parseBatchSession).filter((s): s is BatchSession => Boolean(s)),
		nextRank: scheduleCursor(data, past)
	};
}
export async function loadScheduleMany(batchUid: string, past: boolean, pages: number, startRank: number | undefined = undefined): Promise<{ sessions: BatchSession[]; nextRank: number | null }> {
	const sessions: BatchSession[] = [];
	const seen = new Set<string>();
	let rank = startRank;
	let nextRank = null;
	for (let i = 0; i < pages; i++) {
		const slice = await loadScheduleSlice(batchUid, past, rank).catch(onFail(`batch.schedule.${batchUid}`, {
			sessions: [],
			nextRank: null
		}));
		for (const s of slice.sessions) {
			if (seen.has(s.uid)) continue;
			seen.add(s.uid);
			sessions.push(s);
		}
		nextRank = slice.nextRank;
		if (slice.nextRank == null) break;
		rank = slice.nextRank;
	}
	return {
		sessions,
		nextRank
	};
}
export function emptyClass(uid: string, slug: string, extra: Partial<ClassDetail> = {}): ClassDetail {
	return {
		uid,
		title: extra.title || "Live class",
		slug: extra.slug || slug,
		authorName: extra.authorName || "",
		authorUsername: extra.authorUsername || "",
		authorAvatar: extra.authorAvatar || "",
		courseUid: extra.courseUid || "",
		courseSlug: extra.courseSlug || "",
		courseName: extra.courseName || "",
		liveAt: extra.liveAt ?? null,
		durationSec: extra.durationSec || 0,
		status: extra.status || "unavailable",
		replayId: extra.replayId ?? null,
		notesUrl: extra.notesUrl ?? null,
		slidesUrl: extra.slidesUrl ?? null,
		hlsUrls: extra.hlsUrls || [],
		livePlayer: extra.livePlayer || "https://player.uacdn.net/liveweb/v4036/index.html",
		attendance: extra.attendance || 0
	};
}
export const LIVE_GOALS = [
	"YOTUH",
	"TMUVD",
	"KSCGY",
	"HPJNT",
	"XNDUS"
];
export const PLUS_BATCHES = ["20OP5FTS"];
export function istDay(d: Date): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}
export function isIstToday(iso: string | null | undefined): boolean {
	if (!iso) return false;
	const t = new Date(iso);
	if (Number.isNaN(t.getTime())) return false;
	return istDay(t) === istDay(new Date());
}
export function isIstSoon(iso: string | null | undefined, days: number): boolean {
	if (!iso) return false;
	const t = new Date(iso);
	if (Number.isNaN(t.getTime())) return false;
	const diff = t.getTime() - Date.now();
	return diff > 0 && diff < days * 86400000;
}
export function parseFeedSlot(raw: unknown): LiveSlot | null {
	const row = asObj(raw);
	const sess = asObj(asObj(row.next_session).properties);
	const author = asObj(row.author);
	const goal = asObj(row.goal);
	const classUid = asStr(sess.uid);
	const title = asStr(sess.name || row.name);
	if (!classUid || !title) return null;
	const liveAt = asStr(sess.live_at || sess.liveAt || row.starts_at) || null;
	const replay = pickReplayId(sess) || pickReplayId(row);
	let status = lessonStatus(replay, liveAt, sess.state == null || sess.state === "" ? 0 : asNum(sess.state));
	if (row.is_live === true) status = "live";
	return {
		classUid,
		classSlug: asStr(sess.slug || row.slug),
		title,
		authorName: `${asStr(author.first_name || author.firstName)} ${asStr(author.last_name || author.lastName)}`.trim(),
		authorUsername: asStr(author.username),
		authorAvatar: studioAvatar(author.avatar_v2, author.avatar_v1_web, author.avatar_v1, author.avatar),
		goalName: asStr(goal.name || goal.title),
		goalUid: asStr(goal.uid || row.goal_uid),
		liveAt,
		status,
		attendance: asNum(sess.attendance),
		cover: asStr(
			row.cover_photo_v1 ||
				row.cover_photo_v2 ||
				row.cover_photo ||
				sess.cover_photo_v1 ||
				sess.post_thumbnail ||
				sess.postThumbnail ||
				sess.thumbnail ||
				row.thumbnail_v1 ||
				row.thumbnail
		),
		plus: Boolean(row.for_subscription),
		replayId: replay
	};
}
export function slotFromSession(s: BatchSession, extra: Partial<LiveSlot> = {}): LiveSlot {
	return {
		classUid: s.uid,
		classSlug: s.slug,
		title: s.title,
		authorName: s.authorName,
		authorUsername: s.authorUsername,
		authorAvatar: s.authorAvatar,
		goalName: extra?.goalName || "NEET UG",
		goalUid: extra?.goalUid || "YOTUH",
		liveAt: s.liveAt,
		status: s.status,
		attendance: 0,
		cover: extra?.cover || "",
		plus: extra?.plus ?? true,
		replayId: s.replayId
	};
}
