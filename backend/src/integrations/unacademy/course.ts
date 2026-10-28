import { defineService } from "@/lib/server-fn.ts";
import { swr } from "@/lib/swr-cache";
import {
  applyRelatedReplays,
  htmlLessonBundle,
  mergeLessons,
  type UaLesson,
} from "@inkboard/shared/parse-lesson";
import {
  CourseDetailInput,
  CourseLessonsInput,
} from "@inkboard/shared/ua-input";
import type {
  CourseDetail,
} from "./types.ts";
import {
  onFail,
  TTL,
  asObj,
  asStr,
  parseCourse,
  fetchJson,
  loadCollectionPage,
  loadCoursePageProps,
  loadRelatedReplays,
  loadLessonPages,
  resolveCourseRef,
} from "./support.ts";

export const loadCourseDetail = defineService({ method: "POST" }).validator((d: unknown) => CourseDetailInput.parse(d)).handler(async ({ data }): Promise<CourseDetail> => {
	return swr(`course11:${data.uid}:${data.slug ?? ""}:${data.teacher ?? ""}`, TTL, async () => {
		const resolved = await resolveCourseRef(data.uid, data.slug, data.teacher);
		const uid = resolved.uid;
		const empty: Record<string, unknown> = {};
		let firstFailed = false;
		const collectionP = fetchJson(`https://api.unacademy.com/api/v1/collection/${encodeURIComponent(uid)}/`).then(asObj).catch(onFail("fetch.empty", empty));
		const firstPageP = loadCollectionPage(uid, 0, 50).catch((err) => {
			firstFailed = true;
			return onFail(`collection.first.${uid}`, {
				lessons: [],
				nextOffset: null,
				total: 0,
			})(err);
		});
		const hintedHtmlP = resolved.slug ? loadCoursePageProps(uid, resolved.slug).catch(onFail("fetch.empty", empty)) : Promise.resolve(empty);
		const collection = asObj(await collectionP);
		const slug = resolved.slug || asStr(collection.slug) || undefined;
		const htmlP = resolved.slug || !slug ? hintedHtmlP : loadCoursePageProps(uid, slug).catch(onFail("fetch.empty", {}));
		const [firstPage, pageProps] = await Promise.all([firstPageP, htmlP]);
		const fromHtml = htmlLessonBundle(pageProps);
		const restP = fromHtml.complete || firstPage.nextOffset == null ? null : loadLessonPages(uid, firstPage.nextOffset, firstPage.total || firstPage.nextOffset + 200);
		const fbCourse = asObj(asObj(pageProps).courseFallbackData);
		let parsed = parseCourse(collection) || parseCourse({
			...fbCourse,
			uid: asStr(fbCourse.uid) || uid,
			name: asStr(fbCourse.name || fbCourse.title),
			slug: asStr(fbCourse.slug) || slug,
			thumbnail_v1: fbCourse.thumbnail || fbCourse.coverPhoto,
			item_count: fbCourse.itemCount ?? fbCourse.item_count,
			language_display: fbCourse.languageDisplay || fbCourse.language,
			author: collection.author || fbCourse.author
		});
		if (!parsed && firstPage.lessons.length) parsed = {
			uid,
			name: asStr(fbCourse.name) || firstPage.lessons[0]?.title || uid,
			slug: slug || asStr(collection.slug),
			thumbnail: asStr(collection.thumbnail_v1 || collection.thumbnail),
			itemCount: firstPage.total || firstPage.lessons.length,
			language: asStr(collection.language_display),
			startsAt: null,
			endsAt: null,
			viewCount: 0,
			topics: []
		};
		if (firstFailed && !fromHtml.lessons.length) throw new Error("This shelf did not load");
		if (!parsed) throw new Error(data.teacher ? "Unacademy published that as a playlist, not a course — open the teacher instead." : "This shelf did not load");
		const author = asObj(collection.author || fbCourse.author);
		const authorUsername = asStr(author.username) || data.teacher || "";
		const relatedP = authorUsername ? loadRelatedReplays(authorUsername, parsed.name, parsed.uid).catch(onFail("fetch.list", [])) : Promise.resolve([]);
		const [rest, related] = await Promise.all([restP ? restP : Promise.resolve({
			lessons: [],
			nextOffset: null,
			total: 0
		}), relatedP]);
		const lessons = applyRelatedReplays(mergeLessons([
			firstPage.lessons,
			rest.lessons,
			fromHtml.lessons
		]), related);
		const total = firstPage.total || fromHtml.total || rest.total || lessons.length;
		return {
			course: {
				...parsed,
				description: asStr(collection.description || fbCourse.description),
				authorName: `${asStr(author.firstName || author.first_name)} ${asStr(author.lastName || author.last_name)}`.trim(),
				authorUsername
			},
			lessons,
			nextOffset: fromHtml.complete ? null : restP ? rest.nextOffset : firstPage.nextOffset,
			total
		};
	}, TTL * 6, (d) => Boolean(d.course?.uid) && (d.lessons.length > 0 || d.total === 0));
});
export const loadCourseLessons = defineService({ method: "POST" }).validator((d: unknown) => CourseLessonsInput.parse(d)).handler(async ({ data }): Promise<{ lessons: UaLesson[]; nextOffset: number | null; total: number }> => {
		const [page, pageProps] = await Promise.all([loadLessonPages(data.uid, data.offset, data.total), data.slug ? loadCoursePageProps(data.uid, data.slug).catch(onFail("fetch.empty", {})) : Promise.resolve({})]);
		const fromHtml = htmlLessonBundle(pageProps);
		return {
			lessons: mergeLessons([page.lessons, fromHtml.lessons]),
			nextOffset: fromHtml.complete ? null : page.nextOffset,
			total: page.total || fromHtml.total
		};
});
