import { normalizeUsername } from "@inkboard/shared/unacademy-ids";
import { studioAvatar } from "@inkboard/shared/media-cover";
import { swr } from "@/lib/swr-cache";
import { nextCoursePage, rankRelatedCourses, sheldonOffsetFromNext } from "@inkboard/shared/related-replays";
import { htmlLessonBundle, mergeLessons, parseLesson, type UaLesson, type RelatedHit } from "@inkboard/shared/parse-lesson";
import type { Educator, UaCourse } from "./types.ts";
import {
  asArr,
  asNum,
  asObj,
  asStr,
  cachedBuildId,
  fetchJson,
  fetchText,
  logUa,
  nextData,
  onFail,
  parseCourse,
  rememberBuildId,
  type CourseListPage,
  type LessonPage,
} from "./http.ts";

export async function loadProfile(username: string): Promise<Educator | null> {
	const uname = normalizeUsername(username);
	if (!uname) return null;
	try {
		const [info, legacy] = await Promise.all([fetchJson(`https://api.unacademy.com/sheldon/v1/user/info?username=${encodeURIComponent(uname)}`).catch(onFail("fetch", null)), fetchJson(`https://api.unacademy.com/api/v1/user/${encodeURIComponent(uname)}/`).catch(onFail("fetch", null))]);
		const a = asObj(info);
		const b = asObj(legacy);
		const user = asStr(a.username || b.username);
		if (!user) return null;
		const first = asStr(a.first_name || b.first_name);
		const last = asStr(a.last_name || b.last_name);
		return {
			username: user,
			uid: asStr(a.uid || b.uid),
			name: `${first} ${last}`.trim() || user,
			bio: asStr(a.bio || b.bio),
			avatar: studioAvatar(a.avatar_v2, a.avatar_v1_web, a.avatar_v1, a.old_avatar, a.avatar, b.avatar_v2, b.avatar_v1, b.avatar),
			followers: asNum(a.followers ?? b.followers_count),
			languages: asArr(a.languages).map(asStr).filter(Boolean),
			designation: asStr(a.designation),
			courseCount: asNum(b.courses_count)
		};
	} catch (err) {
		logUa(`profile.${uname}`, err);
		return null;
	}
}
export async function loadCoursesFromHtml(username: string, sort: string, offset: number): Promise<{
	courses: UaCourse[];
	total: number;
	nextOffset: number | null;
}> {
	const type = sort === "popular" ? "popular" : "latest";
	if (offset > 0) {
		const data = asObj(await fetchJson(
			`https://api.unacademy.com/sheldon/v1/list/course?limit=12&offset=${offset}&type=${type}&username=${encodeURIComponent(username)}`,
		));
		const courses = asArr(data.results).map(parseCourse).filter((c): c is UaCourse => Boolean(c));
		return {
			courses,
			total: asNum(data.count),
			nextOffset: data.next ? offset + courses.length : null,
		};
	}
	const html = await fetchText(
		`https://unacademy.com/@${encodeURIComponent(username)}/courses?type=${type}&offset=${offset}`,
		14_000,
	);
	const nd = nextData(html);
	if (!nd) return { courses: [], total: 0, nextOffset: null };
	rememberBuildId(nd);
	const fc = asObj(asObj(asObj(nd.props).pageProps).fallbackCourses);
	const courses = asArr(fc.results).map(parseCourse).filter((c): c is UaCourse => Boolean(c));
	const sheldonOff = sheldonOffsetFromNext(fc.next);
	return {
		courses,
		total: asNum(fc.count) || courses.length,
		nextOffset: sheldonOff != null && sheldonOff > offset ? sheldonOff : fc.next ? offset + courses.length : null,
	};
}
export async function loadCourses(username: string, sort: string, offset: number, limit: number): Promise<CourseListPage> {
	const uname = normalizeUsername(asStr(username));
	if (!uname) return { courses: [], total: 0, nextOffset: null };
	try {
		const data = asObj(await fetchJson(`https://api.unacademy.com/sheldon/v1/list/course?limit=${limit}&offset=${offset}&type=${sort}&username=${encodeURIComponent(uname)}`));
		const courses = asArr(data.results).map(parseCourse).filter((c): c is UaCourse => Boolean(c));
		if (courses.length || asNum(data.count) > 0) {
			return {
				courses,
				total: asNum(data.count),
				nextOffset: data.next ? offset + courses.length : null
			};
		}
	} catch (err) {
		logUa(`courses.sheldon.${uname}`, err);
	}
	return loadCoursesFromHtml(uname, asStr(sort) || "latest", offset).catch(onFail(`courses.html.${uname}`, {
		courses: [],
		total: 0,
		nextOffset: null,
	}));
}
export async function loadCollectionPage(uid: string, offset: number, limit = 50): Promise<LessonPage> {
	const data = asObj(await fetchJson(`https://api.unacademy.com/api/v1/collection/${encodeURIComponent(uid)}/items/?limit=${limit}&offset=${offset}`));
	const lessons = asArr(data.results).map((row, i) => parseLesson(row, offset + i)).filter((l): l is UaLesson => Boolean(l));
	return {
		lessons,
		nextOffset: data.next ? offset + lessons.length : null,
		total: asNum(data.count)
	};
}
export async function loadCoursePageProps(uid: string, slug: string): Promise<Record<string, unknown>> {
	if (!uid) return {};
	const paths: string[] = [];
	if (slug) {
		paths.push(`${encodeURIComponent(slug)}/${encodeURIComponent(uid)}`);
		paths.push(`${encodeURIComponent(uid)}/${encodeURIComponent(slug)}`);
	}
	const tryNext = async (path: string) => {
		if (!cachedBuildId) return {};
		const pageProps = asObj(asObj(await fetchJson(`https://unacademy.com/_next/data/${cachedBuildId}/course/${path}.json`, 12_000)).pageProps);
		return pageProps.lessonListFallbackData || pageProps.courseFallbackData ? pageProps : {};
	};
	const tryHtml = async (path: string) => {
		for (const base of ["https://unacademy.com/course/", "https://unacademy.com/plus/course/"]) {
			try {
				const nd = nextData(await fetchText(`${base}${path}`, 16_000));
				if (!nd) continue;
				rememberBuildId(nd);
				const pageProps = asObj(asObj(asObj(nd).props).pageProps);
				if (pageProps.lessonListFallbackData || pageProps.courseFallbackData) return pageProps;
			} catch (err) {
				logUa("course.html", err);
			}
		}
		return {};
	};
	for (const path of paths) {
		if (cachedBuildId) {
			try {
				const hit = await tryNext(path);
				if (asArr(asObj(hit.lessonListFallbackData).results).length) return hit;
			} catch (err) {
				logUa("course.nextData.cached", err);
			}
		}
		try {
			const hit = await tryHtml(path);
			if (asArr(asObj(hit.lessonListFallbackData).results).length) return hit;
		} catch (err) {
			logUa("course.html", err);
		}
		if (cachedBuildId) {
			try {
				const hit = await tryNext(path);
				if (asArr(asObj(hit.lessonListFallbackData).results).length) return hit;
			} catch (err) {
				logUa("course.nextData.retry", err);
			}
		}
	}
	return {};
}
export async function replayFromCourseLessons(courseUid: string, courseSlug: string, classUid: string): Promise<string | null> {
	if (!courseUid || !classUid) return null;
	try {
		const slug = courseSlug || courseUid;
		const props = await loadCoursePageProps(courseUid, slug);
		const hit = htmlLessonBundle(props).lessons.find((l) => l.uid === classUid);
		return hit?.replayId || null;
	} catch (err) {
		logUa(`class.replay.${classUid}`, err);
		return null;
	}
}
export async function loadTeacherCoursePages(username: string): Promise<UaCourse[]> {
	const out: UaCourse[] = [];
	const seen = new Set<string>();
	let offset = 0;
	for (let n = 0; n < 8; n += 1) {
		const page = await loadCourses(username, "latest", offset, 30).catch(
			onFail(`related.courses.${offset}`, { courses: [], total: 0, nextOffset: null }),
		);
		for (const c of page.courses) {
			if (!c.uid || seen.has(c.uid)) continue;
			seen.add(c.uid);
			out.push(c);
		}
		if (page.nextOffset == null || !page.courses.length || page.nextOffset <= offset) break;
		const following = nextCoursePage(offset, page.courses.length, page.total, true);
		if (following == null) break;
		offset = following;
	}
	return out;
}
export async function loadRelatedReplays(username: string, courseName: string, excludeUid = ""): Promise<RelatedHit[]> {
	const topic = courseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "x";
	return swr(`relplay9:${username.toLowerCase()}:${topic}:${excludeUid}`, 18e5, async () => {
		const related = rankRelatedCourses(courseName, await loadTeacherCoursePages(username), excludeUid);
		const bundles = await Promise.all(
			related.map(async (c) => {
				try {
					const lessons = htmlLessonBundle(await loadCoursePageProps(c.uid, c.slug)).lessons.filter((l) => l.replayId);
					return { name: c.name, lessons };
				} catch (err) {
					logUa(`related.${c.uid}`, err);
					return { name: c.name, lessons: [] as UaLesson[] };
				}
			}),
		);
		const out: RelatedHit[] = [];
		const got = new Set<string>();
		for (const bundle of bundles)
			for (const l of bundle.lessons) {
				if (!l.replayId || got.has(l.replayId)) continue;
				got.add(l.replayId);
				out.push({
					replayId: l.replayId,
					notesUrl: l.notesUrl,
					slidesUrl: l.slidesUrl,
					durationSec: l.durationSec,
					title: l.title,
					courseName: bundle.name,
				});
			}
		return out;
	});
}
export async function loadLessonPages(uid: string, offset: number, totalHint = 0): Promise<LessonPage> {
	if (totalHint <= offset) {
		const first = await loadCollectionPage(uid, offset, 50);
		if (first.nextOffset == null) return first;
		const rest = await loadLessonPages(uid, first.nextOffset, first.total || offset + 200);
		return {
			lessons: mergeLessons([first.lessons, rest.lessons]),
			nextOffset: rest.nextOffset,
			total: first.total || rest.total
		};
	}
	const cap = Math.min(800, totalHint);
	const offsets = [];
	for (let o = offset; o < cap; o += 50) offsets.push(o);
	if (offsets.length === 0) offsets.push(offset);
	const pages = await Promise.all(offsets.map((o) => loadCollectionPage(uid, o, 50).catch(onFail(`collection.page.${uid}.${o}`, {
		lessons: [],
		nextOffset: null,
		total: 0
	}))));
	const total = pages.find((p) => p.total)?.total || totalHint;
	const lessons = mergeLessons(pages.map((p) => p.lessons));
	const loadedThrough = offset + lessons.length;
	return {
		lessons,
		nextOffset: total > loadedThrough && loadedThrough < 800 ? loadedThrough : null,
		total: total || lessons.length
	};
}
