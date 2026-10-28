import { defineService } from "@/lib/server-fn.ts";
import { getExam, examGoalIds, } from "@inkboard/shared/exams";
import { swr } from "@/lib/swr-cache";
import { hubHasContent } from "@inkboard/shared/catalog-cache";
import {
  ExamCoursesInput,
  ExamHubInput,
  ExamSubjectInput,
  ExamTeachersInput,
  TestSeriesItemsInput,
} from "@inkboard/shared/ua-input";
import {
  parseTestItemPage,
  parseTestSeriesPage,
  testSeriesItemsUrl,
  testSeriesListUrl,
  type TestItem,
  type TestSeries,
} from "@inkboard/shared/test-series";
import { crashFromCourse, mergeCrashDoors, parseCrashBanner, type CrashDoor } from "@inkboard/shared/crash-doors";
import { parsePracticePage, practicePageUrl, type PracticeLine } from "@inkboard/shared/practice-lines";
import type {
  ExamTeacher,
  ExamPage,
  ExamPlaylist,
  ExamSubject,
  ExamCourse,
  ExamHub,
  LiveSlot,
} from "./types.ts";
import {
  logUa,
  onFail,
  FAST_TTL,
  asObj,
  asStr,
  asNum,
  asArr,
  fetchJson,
  fetchText,
  nextData,
  loadCourses,
  parseExamTeacher,
  parseExamPlaylist,
  parseExamSubject,
  parseExamCourse,
  bestCourseMatch,
  playlistMiss,
  playlistGate,
  loadPlusCourses,
  uniqBy,
  loadPlusAcross,
  loadTopologySubjects,
  mergeTeachers,
  isIstToday,
  isIstSoon,
  parseFeedSlot,
} from "./support.ts";

export const loadExamTeachers = defineService({ method: "POST" }).validator((d: unknown) => ExamTeachersInput.parse(d)).handler(async ({ data }): Promise<ExamPage> => {
		const exam = getExam(data.goalId)!;
		const goals = examGoalIds(exam);
		const goal = goals[0] || exam.sourceGoal || exam.id;
		const product = exam.product === "iconic_pro" ? "&product=iconic_pro" : "";
		const payload = asObj(await fetchJson(`https://unacademy.com/api/v1/uplus/subscription/goal_educators/?goal_uid=${goal}&limit=24&offset=${data.offset}${product}`));
		const teachers = asArr(payload.results).map(parseExamTeacher).filter((t): t is ExamTeacher => Boolean(t));
		const total = asNum(payload.count) || teachers.length;
		const nextOffset = payload.next ? data.offset + teachers.length : null;
		return {
			exam,
			teachers,
			total,
			nextOffset
		};
});
export async function resolvePlaylist(p: ExamPlaylist): Promise<ExamPlaylist> {
	if (!p?.uid || playlistMiss.has(p.uid)) return p;
	if (p.courseUid) return p;
	if (playlistGate.inflight >= 2) return p;
	playlistGate.inflight += 1;
	try {
		const page = await loadCourses(p.authorUsername, "latest", 0, 24);
		const hit = bestCourseMatch(p.name, page.courses);
		if (hit && hit.uid !== p.uid) return {
			...p,
			courseUid: hit.uid,
			courseSlug: asStr(hit.slug),
			thumbnail: p.thumbnail || hit.thumbnail
		};
		playlistMiss.add(p.uid);
	} catch (err) {
		logUa(`playlist.teacher.${p.authorUsername}`, err);
		playlistMiss.add(p.uid);
	} finally {
		playlistGate.inflight -= 1;
	}
	return p;
}
export const loadExamHub = defineService({ method: "POST" }).validator((d: unknown) => ExamHubInput.parse(d)).handler(async ({ data }): Promise<ExamHub> => {
	const exam = getExam(data.goalId)!;
	return swr(`exam-hub13:${exam.id}`, FAST_TTL, async () => {
		const goals = examGoalIds(exam);
		const goal = goals[0] || exam.sourceGoal || exam.id;
		const extraGoals = goals.filter((id) => id !== goal);
		const iconic = exam.product === "iconic_pro";
		const homeGoals = iconic ? [goal, ...extraGoals.slice(0, 2)] : [goal, ...extraGoals];
		const partial: string[] = [];
		const miss = <T,>(name: string, fallback: T) => (err: unknown): T => {
			partial.push(name);
			return onFail(name, fallback)(err);
		};
		const [teachersPage, iconicTeachers, plusAll, topoSubjects, ...homePages] = await Promise.all([
			fetchJson(`https://unacademy.com/api/v1/uplus/subscription/goal_educators/?goal_uid=${goal}&limit=36&offset=0`).catch(miss("teachers", null)),
			iconic ? fetchJson(`https://unacademy.com/api/v1/uplus/subscription/goal_educators/?goal_uid=${goal}&limit=24&offset=0&product=iconic_pro`).catch(miss("iconic-teachers", null)) : Promise.resolve(null),
			loadPlusAcross(goals, 0, iconic ? 16 : 24).catch(miss("courses", { courses: [], total: 0, nextOffset: null })),
			iconic ? loadTopologySubjects(exam.id).catch(miss("subjects", [] as ExamSubject[])) : Promise.resolve([] as ExamSubject[]),
			...homeGoals.map((id) => Promise.all([fetchJson(`https://unacademy.com/api/v1/uplus/special_class/home/?goal_uid=${id}&limit=50`, 8e3).catch(miss(`home.${id}`, null)), id === goal ? Promise.resolve(null) : fetchJson(`https://unacademy.com/api/v1/uplus/subscription/goal_educators/?goal_uid=${id}&limit=18&offset=0`, 8e3).catch(miss(`teachers.${id}`, null))]))
		]);
		const extraTeacherPages = homePages.map((row) => Array.isArray(row) ? row[1] : null);
		const payload = asObj(teachersPage);
		const iconicListed = asArr(asObj(iconicTeachers).results).map(parseExamTeacher).filter((t): t is ExamTeacher => Boolean(t));
		const primaryListed = asArr(payload.results).map(parseExamTeacher).filter((t): t is ExamTeacher => Boolean(t));
		const listed = [...iconicListed];
		for (const t of primaryListed) listed.push(t);
		for (const page of extraTeacherPages) listed.push(...asArr(asObj(page).results).map(parseExamTeacher).filter((t): t is ExamTeacher => Boolean(t)));
		const playlists: ExamPlaylist[] = [];
		const trending: ExamCourse[] = [];
		const subjects = [...topoSubjects];
		const popular: ExamTeacher[] = [];
		const live: LiveSlot[] = [];
		const upcoming: LiveSlot[] = [];
		const crashRows: CrashDoor[] = [];
		const ingestHome = (raw: unknown) => {
			for (const block of asArr(asObj(raw).results)) {
				const b = asObj(block);
				const kind = asStr(b.type);
				const rows = asArr(b.data);
				if (kind === "curated_playlist") for (const row of rows) {
					const p = parseExamPlaylist(row);
					if (p) playlists.push(p);
				}
				else if (kind === "popular_subjects") {
					if (iconic) continue;
					for (const row of rows) {
						const s = parseExamSubject(row);
						if (s) subjects.push(s);
					}
				}
				else if (kind === "trending") for (const row of rows) {
					const c = parseExamCourse(row);
					if (c) trending.push(c);
				}
				else if (kind === "educators") for (const row of rows) {
					const t = parseExamTeacher(row);
					if (t) popular.push(t);
				}
				else if (kind === "live_now" || kind === "upcoming") for (const row of rows) {
					const slot = parseFeedSlot(row);
					if (!slot) continue;
					const tagged = {
						...slot,
						goalUid: slot.goalUid || exam.id,
						goalName: slot.goalName || exam.name
					};
					if (tagged.status === "live") live.push(tagged);
					else if (tagged.status === "upcoming") upcoming.push(tagged);
				}
				else if (kind === "carousel_feed") for (const row of rows) {
					const door = parseCrashBanner({
						title: asStr(asObj(row).title),
						name: asStr(asObj(row).name),
						click_url: asStr(asObj(row).click_url || asObj(row).clickUrl),
						permalink: asStr(asObj(row).permalink),
					});
					if (door) crashRows.push(door);
				}
			}
		};
		for (const row of homePages) ingestHome(Array.isArray(row) ? row[0] : null);
		const later = upcoming.filter((s) => isIstToday(s.liveAt));
		const week = upcoming.filter((s) => !isIstToday(s.liveAt) && isIstSoon(s.liveAt, 8));
		const teachers = iconic ? mergeTeachers(iconicListed, mergeTeachers(popular, listed)) : mergeTeachers(popular, listed);
		const total = iconic ? Math.max(teachers.length, iconicListed.length) : Math.max(asNum(payload.count), asNum(asObj(iconicTeachers).count), teachers.length);
		const crash = mergeCrashDoors([
			...crashRows,
			...plusAll.courses.map(crashFromCourse),
			...trending.map(crashFromCourse),
		]);
		const hub = {
			exam,
			teachers,
			total,
			nextOffset: payload.next ? primaryListed.length : null,
			playlists: uniqBy(playlists, (p) => p.uid).slice(0, 16),
			trending: uniqBy(trending, (c) => c.uid),
			subjects: uniqBy(subjects, (s) => s.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || s.uid),
			courses: plusAll.courses,
			coursesTotal: Math.max(plusAll.total, plusAll.courses.length),
			coursesNext: plusAll.nextOffset,
			live: uniqBy(live, (s) => s.classUid || s.replayId || s.title),
			later: uniqBy(later, (s) => s.classUid || s.replayId || s.title),
			week: uniqBy(week, (s) => s.classUid || s.replayId || s.title),
			crash,
			partial,
		};
		if (!hubHasContent(hub)) {
			throw new Error("This wall did not load");
		}
		return hub;
	}, FAST_TTL * 6, (d) => !d.partial?.length);
});
export const loadExamSubjectCourses = defineService({ method: "POST" }).validator((d: unknown) => ExamSubjectInput.parse(d)).handler(async ({ data }): Promise<{ courses: ExamCourse[] }> => {
		const raw = await fetchJson(`https://unacademy.com/api/v1/uplus/special_class/topic_group_courses/?topology_uid=${data.topologyUid}&special_only=True`).catch(onFail("fetch", null));
		return { courses: (Array.isArray(raw) ? raw : asArr(asObj(raw).results)).map(parseExamCourse).filter((c): c is ExamCourse => Boolean(c)) };
});
export const loadExamCourses = defineService({ method: "POST" }).validator((d: unknown) => ExamCoursesInput.parse(d)).handler(async ({ data }): Promise<{ courses: ExamCourse[]; nextOffset: number | null; total: number }> => {
		const exam = getExam(data.goalId)!;
		const goals = examGoalIds(exam);
		if (goals.length > 1) return loadPlusAcross(goals, data.offset, 16);
		return loadPlusCourses(goals[0] || exam.id, data.offset, 24);
});
export const loadExamTests = defineService({ method: "POST" }).validator((d: unknown) => ExamHubInput.parse(d)).handler(async ({ data }): Promise<{ series: TestSeries[] }> => {
	const exam = getExam(data.goalId)!;
	return swr(`exam-tests2:${exam.id}`, FAST_TTL * 4, async () => {
		const goals = examGoalIds(exam);
		const pages = await Promise.all(
			goals.slice(0, 6).map((id) => fetchJson(testSeriesListUrl(id), 8e3).catch(onFail(`tests.${id}`, { results: [] }))),
		);
		const seen = new Set<string>();
		const series: TestSeries[] = [];
		for (const page of pages) {
			for (const row of parseTestSeriesPage(page)) {
				if (seen.has(row.uid)) continue;
				seen.add(row.uid);
				series.push(row);
			}
		}
		return { series };
	});
});
export const loadTestSeriesItems = defineService({ method: "POST" }).validator((d: unknown) => TestSeriesItemsInput.parse(d)).handler(async ({ data }): Promise<{ items: TestItem[]; total: number }> => {
	return swr(`test-items2:${data.uid}`, FAST_TTL * 4, async () => {
		const items: TestItem[] = [];
		let offset = 0;
		let total = 0;
		for (let i = 0; i < 5; i++) {
			const page = parseTestItemPage(await fetchJson(testSeriesItemsUrl(data.uid, offset), 10e3));
			total = Math.max(total, page.total);
			const seen = new Set(items.map((x) => x.uid));
			for (const row of page.items) {
				if (seen.has(row.uid)) continue;
				items.push(row);
			}
			if (page.nextOffset == null || page.items.length === 0) break;
			offset = page.nextOffset;
		}
		items.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
		return { items, total: Math.max(total, items.length) };
	});
});
export const loadExamPractice = defineService({ method: "POST" }).validator((d: unknown) => ExamHubInput.parse(d)).handler(async ({ data }): Promise<{ lines: PracticeLine[]; locked: boolean }> => {
	const exam = getExam(data.goalId)!;
	return swr(`exam-practice1:${exam.id}`, FAST_TTL * 4, async () => {
		const goals = examGoalIds(exam);
		const pages = await Promise.all(
			goals.slice(0, 4).map(async (id) => {
				const g = getExam(id) || exam;
				const html = await fetchText(practicePageUrl(g.slug, id), 12e3).catch(onFail(`practice.${id}`, ""));
				if (!html) return parsePracticePage(null);
				return parsePracticePage(nextData(html));
			}),
		);
		const seen = new Set<string>();
		const lines: PracticeLine[] = [];
		let locked = false;
		for (const page of pages) {
			if (page.locked) locked = true;
			for (const row of page.lines) {
				if (seen.has(row.uid)) continue;
				seen.add(row.uid);
				lines.push({ ...row, locked: row.locked || page.locked });
			}
		}
		return { lines, locked };
	});
});
