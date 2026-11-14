import { defineService } from "@/lib/server-fn.ts";
import { normalizeUsername } from "@inkboard/shared/unacademy-ids";
import { getExam, examGoalIds, } from "@inkboard/shared/exams";
import { swr } from "@/lib/swr-cache";
import { collectPages } from "@/lib/paged.ts";
import { studioAvatar } from "@inkboard/shared/media-cover";
import {
	educatorListingOffsets,
	educatorListingUrl,
	educatorMatchesQuery,
	EDUCATOR_LISTING_PAGE_SIZE,
	extraNameQueries,
	listingNextUrl,
	namesFromKeywordLabels,
	searchV3Url,
	usersFromAutocomplete,
	usersFromListing,
	usersFromSearchV3,
} from "@inkboard/shared/educator-search";
import {
  EducatorPageInput,
  SearchEducatorsInput,
} from "@inkboard/shared/ua-input";
import type {
  Educator,
  EducatorPage,
  EducatorHit,
  ExamTeacher,
} from "./types.ts";
import {
  onFail,
  TTL,
  asObj,
  asStr,
  asNum,
  asArr,
  aggregateTopics,
  fetchJson,
  loadProfile,
  loadCourses,
  parseExamTeacher,
} from "./support.ts";

/** Time the follow-up listing pages of one search may use, after the first parallel round. */
const LIST_BUDGET_MS = 6_000;

/** A thin profile built from the handle alone, used when the course list proves the teacher exists but the profile fetch failed. */
function fallbackEducator(username: string, courseTotal: number): Educator | null {
	if (courseTotal <= 0) return null;
	const handle = username.toLowerCase();
	const name = handle.replace(/-\d+$/, "").replace(/[._-]+/g, " ").trim().replace(/\b\w/g, (ch) => ch.toUpperCase()) || handle;
	return { username: handle, uid: "", name, bio: "", avatar: "", followers: 0, languages: [], designation: "", courseCount: courseTotal };
}

export const loadEducatorPage = defineService({ method: "POST" }).validator((d: unknown) => EducatorPageInput.parse(d)).handler(async ({ data }): Promise<EducatorPage> => {
	return swr(`edu3:${data.sort}:${data.offset}:${data.username.toLowerCase()}`, TTL, async () => {
		const extraOffset = data.offset === 0 ? 30 : -1;
		const [educator, page, extra] = await Promise.all([
			loadProfile(data.username),
			loadCourses(data.username, data.sort, data.offset, 30),
			extraOffset >= 0 ? loadCourses(data.username, data.sort, extraOffset, 30).catch(onFail("educator.courses.extra", {
				courses: [],
				total: 0,
				nextOffset: null
			})) : Promise.resolve({
				courses: [],
				total: 0,
				nextOffset: null
			})
		]);
		// The profile endpoints are best-effort (transport failures resolve to null). Only call the
		// handle "not found" when the course list is empty too — otherwise fall back to a thin profile
		// so a flaky profile fetch never turns a real teacher into a 404.
		const resolved = educator ?? fallbackEducator(data.username, page.total || extra.total);
		if (!resolved) throw new Error("No Unacademy teacher with that username");
		const seen = new Set(page.courses.map((c) => c.uid));
		const courses = extra.courses.length ? [...page.courses, ...extra.courses.filter((c) => !seen.has(c.uid))] : page.courses;
		const nextOffset = extra.courses.length ? extra.nextOffset : page.nextOffset;
		return {
			educator: {
				...resolved,
				courseCount: resolved.courseCount || page.total || extra.total
			},
			courses,
			totalCourses: page.total || extra.total,
			nextOffset,
			topics: aggregateTopics(courses),
			sort: data.sort as EducatorPage["sort"]
		};
	});
});
export const searchEducators = defineService({ method: "POST" }).validator((d: unknown) => SearchEducatorsInput.parse(d)).handler(async ({ data }): Promise<{ exact: Educator | null; hits: EducatorHit[] }> => {
	return swr(
		`seek8:${data.goalId ?? ""}:${data.q.toLowerCase()}`,
		TTL,
		async () => {
		const uname = normalizeUsername(data.q);
		const needle = data.q.toLowerCase();
		const scoped = data.goalId ? getExam(data.goalId) : undefined;
		const autoUrl = `https://unacademy.com/api/v1/search/autocomplete/?q=${encodeURIComponent(data.q)}`;
		const compactQ = data.q.replace(/[^a-zA-Z0-9]/g, "");
		const compactAutoUrl = /\s/.test(data.q) && compactQ.length >= 4
			? `https://unacademy.com/api/v1/search/autocomplete/?q=${encodeURIComponent(compactQ)}`
			: "";
		const [exact, v3, examPage, autoRaw, compactAuto, firstList] = await Promise.all([
			/^[A-Za-z0-9._-]{2,40}$/.test(uname) ? loadProfile(uname) : Promise.resolve(null),
			fetchJson(searchV3Url(data.q)).catch(onFail("search.v3", null)),
			scoped ? Promise.all(examGoalIds(scoped).map((id) => fetchJson(`https://unacademy.com/api/v1/uplus/subscription/goal_educators/?goal_uid=${id}&limit=24&offset=0`).catch(onFail(`exam.teachers.${id}`, null)))).then((pages) => pages.find((p) => asArr(asObj(p).results).length) ?? pages[0]) : Promise.resolve(null),
			fetchJson(autoUrl).catch(onFail("search.auto", [])),
			compactAutoUrl ? fetchJson(compactAutoUrl).catch(onFail("search.auto.compact", [])) : Promise.resolve([]),
			fetchJson(educatorListingUrl(data.q, 0)).catch(onFail("search.list", null)),
		]);
		// Follow the listing's next links, but stop once LIST_BUDGET_MS is spent: one slow upstream page
		// used to hold the whole search for up to 12 sequential fetches.
		const listed0 = await collectPages<unknown>({
			first: firstList,
			rows: (pg) => asArr(asObj(pg).results),
			next: (pg, n) => listingNextUrl(asObj(pg).next, data.q, n * EDUCATOR_LISTING_PAGE_SIZE),
			fetchPage: (url) => fetchJson(url).catch(onFail("search.list", null)),
			maxPages: 12,
			budgetMs: LIST_BUDGET_MS,
		});
		const listRows: unknown[] = listed0.rows;
		if (listRows.length < 10) {
			const rest = await Promise.all(
				educatorListingOffsets(8).slice(1).map((offset) => fetchJson(educatorListingUrl(data.q, offset)).catch(onFail("search.list", null))),
			);
			listRows.push(...rest.flatMap((page) => asArr(asObj(page).results)));
		}
		const autoRows = Array.isArray(autoRaw) ? autoRaw : asArr(asObj(autoRaw).results);
		const compactRows = Array.isArray(compactAuto) ? compactAuto : asArr(asObj(compactAuto).results);
		const listed = usersFromListing(listRows);
		const extraNames = [
			...namesFromKeywordLabels(
				autoRows.map((row) => asStr(asObj(row).label)),
				data.q,
			),
			...extraNameQueries(data.q, listed),
		].filter((name) => {
			const key = name.toLowerCase();
			return key !== needle && key !== uname.toLowerCase();
		});
		const uniqueExtras: string[] = [];
		const seenExtra = new Set<string>();
		for (const name of extraNames) {
			const key = name.toLowerCase();
			if (seenExtra.has(key)) continue;
			seenExtra.add(key);
			uniqueExtras.push(name);
			if (uniqueExtras.length >= 10) break;
		}
		const extraAutos = uniqueExtras.length
			? await Promise.all(
				uniqueExtras.map((name) =>
					fetchJson(`https://unacademy.com/api/v1/search/autocomplete/?q=${encodeURIComponent(name)}`).catch(onFail("search.auto.extra", [])),
				),
			)
			: [];
		const autoUsers = [
			...listed,
			...usersFromSearchV3(asArr(asObj(v3).users)),
			...usersFromAutocomplete(autoRows),
			...usersFromAutocomplete(compactRows),
			...extraAutos.flatMap((raw) => usersFromAutocomplete(Array.isArray(raw) ? raw : asArr(asObj(raw).results))),
		];
		const examTeachers = asArr(asObj(examPage).results).map(parseExamTeacher).filter((t): t is ExamTeacher => Boolean(t));
		const examSet = new Set(examTeachers.map((t) => t.username.toLowerCase()));
		const hits: EducatorHit[] = [];
		const seen = new Set<string>();
		const pushHit = (hit: EducatorHit) => {
			const key = hit.username.toLowerCase();
			if (!key || seen.has(key)) return;
			if (exact && key === exact.username.toLowerCase()) return;
			if (!educatorMatchesQuery(hit.name, hit.username, data.q)) return;
			seen.add(key);
			hits.push(hit);
		};
		for (const t of autoUsers) {
			pushHit({
				username: t.username,
				uid: t.uid,
				name: t.name,
				bio: "",
				avatar: studioAvatar(t.avatar),
				followers: t.followers,
				courseCount: t.courseCount,
				inExam: examSet.has(t.username.toLowerCase()),
			});
		}
		for (const t of examTeachers) {
			pushHit({
				username: t.username,
				uid: t.uid,
				name: t.name,
				bio: t.bio,
				avatar: t.avatar,
				followers: t.followers,
				courseCount: 0,
				inExam: true,
				topics: t.topics
			});
		}
		for (const row of [...asArr(asObj(v3).results), ...asArr(asObj(v3).users)]) {
			const r = asObj(row);
			const v = asStr(asObj(r.value).username) ? asObj(r.value) : r;
			const username = asStr(v.username) || asStr(asObj(v.stats).username);
			if (!username) continue;
			pushHit({
				username,
				uid: asStr(v.uid),
				name: `${asStr(v.first_name || v.firstName)} ${asStr(v.last_name || v.lastName)}`.trim() || asStr(v.name) || username,
				bio: asStr(v.bio),
				avatar: studioAvatar(v.avatar_v2, v.avatar_v1_web, v.avatar_v1, v.old_avatar, v.avatar),
				followers: asNum(v.followers_count ?? v.followersCount ?? asObj(v.stats).followers),
				courseCount: asNum(v.courses_count ?? v.coursesCount),
				inExam: examSet.has(username.toLowerCase()),
				topics: asStr(v.topics_display || v.topicsDisplay)
			});
		}
		const rank = (name: string, username: string) => {
			const n = name.toLowerCase();
			const u = username.toLowerCase();
			if (n === needle || u === needle) return 4;
			if (n.startsWith(needle) || u.startsWith(needle)) return 3;
			if (n.split(/\s+/).some((w) => w.startsWith(needle))) return 2;
			return 1;
		};
		hits.sort((a, b) => Number(Boolean(b.inExam)) - Number(Boolean(a.inExam)) || rank(b.name, b.username) - rank(a.name, a.username) || b.followers - a.followers);
		return {
			exact,
			hits: hits.slice(0, 80)
		};
		},
		TTL * 6,
		(page) => Boolean(page.exact) || (page.hits?.length ?? 0) >= 6,
	);
});
