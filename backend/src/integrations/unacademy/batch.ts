import { defineService } from "@/lib/server-fn.ts";
import {
  lessonStatus,
  pickReplayId,
} from "@inkboard/shared/parse-lesson";
import {
  BatchDetailInput,
  BatchScheduleInput,
  TeacherBatchesInput,
  TeacherOffsetInput,
} from "@inkboard/shared/ua-input";
import type {
  UaBatch,
  BatchSession,
  BatchDetail,
  SpecialCourse,
} from "./types.ts";
import {
  logUa,
  asObj,
  asStr,
  asNum,
  asArr,
  parseCourse,
  fetchJson,
  fetchText,
  nextData,
  parseBatch,
  loadScheduleMany,
} from "./support.ts";

export const loadEducatorBatches = defineService({ method: "POST" }).validator((d: unknown) => TeacherBatchesInput.parse(d)).handler(async ({ data }): Promise<{ batches: UaBatch[]; total: number; nextOffset: number | null }> => {
		const payload = asObj(await fetchJson(`https://api.unacademy.com/sheldon/v1/list/batch?limit=18&offset=${data.offset}&username=${encodeURIComponent(data.username.toLowerCase())}`));
		const batches = asArr(payload.results).map(parseBatch).filter((b): b is UaBatch => Boolean(b));
		return {
			batches,
			total: asNum(payload.count),
			nextOffset: payload.next ? data.offset + batches.length : null
		};
});
export const loadEducatorSpecials = defineService({ method: "POST" }).validator((d: unknown) => TeacherOffsetInput.parse(d)).handler(async ({ data }): Promise<{ courses: SpecialCourse[]; total: number; nextOffset: number | null }> => {
		const payload = asObj(await fetchJson(`https://api.unacademy.com/sheldon/v1/list/special-class?limit=18&offset=${data.offset}&username=${encodeURIComponent(data.username.toLowerCase())}`));
		const courses = [];
		for (const raw of asArr(payload.results)) {
			const row = asObj(raw);
			const parsed = parseCourse({
				...row,
				thumbnail_v1: row.cover_photo_v1 || row.cover_photo,
				item_count: 1
			});
			if (!parsed) continue;
			const sess = asObj(asObj(row.next_session).properties);
			const liveAt = asStr(sess.live_at || sess.liveAt || row.starts_at) || null;
			const replay = pickReplayId(sess) || pickReplayId(row);
			courses.push({
				...parsed,
				liveAt,
				classUid: asStr(sess.uid) || null,
				classSlug: asStr(sess.slug) || parsed.slug,
				status: lessonStatus(replay, liveAt, asNum(sess.state)),
				replayId: replay
			});
		}
		return {
			courses,
			total: asNum(payload.count),
			nextOffset: payload.next ? data.offset + courses.length : null
		};
});
export const loadBatchDetail = defineService({ method: "POST" }).validator((d: unknown) => BatchDetailInput.parse(d)).handler(async ({ data }): Promise<BatchDetail> => {
		let listed = null;
		let extra = {
			description: "",
			lessonsCount: 0,
			liveClasses: 0,
			mockTests: 0
		};
		if (data.slug) try {
			const bd = asObj(asObj(asObj(asObj(asObj(nextData(await fetchText(`https://unacademy.com/batch/${encodeURIComponent(data.slug)}/${data.uid}`, 16e3))).props).pageProps).fallbackData).batchDetails);
			listed = parseBatch({
				...bd,
				cover_photo: bd.coverPhoto,
				cover_photo_v2: bd.coverPhotoV2,
				starts_at: bd.startsAt,
				completed_at: bd.completedAt,
				syllabus_tag: bd.syllabusTag
			});
			extra = {
				description: asStr(bd.description),
				lessonsCount: asNum(bd.lessonsCount),
				liveClasses: asNum(bd.numberOfLiveClasses),
				mockTests: asNum(bd.numberOfMockTests)
			};
		} catch (err) {
			logUa(`batch.html.${data.uid}`, err);
		}
		const [past, upcoming] = await Promise.all([loadScheduleMany(data.uid, true, 6), loadScheduleMany(data.uid, false, 2)]);
		const map = new Map();
		for (const s of [...upcoming.sessions, ...past.sessions]) map.set(s.uid, s);
		const sessions = [...map.values()].sort((a, b) => {
			return (a.liveAt ? new Date(a.liveAt).getTime() : 0) - (b.liveAt ? new Date(b.liveAt).getTime() : 0);
		});
		if (!listed) listed = {
			uid: data.uid,
			name: sessions[0]?.courseName || "Batch",
			slug: data.slug || "",
			thumbnail: "",
			startsAt: null,
			endsAt: null,
			goalName: "",
			goalUid: "",
			syllabusTag: "",
			language: "",
			authors: [],
			state: 0
		};
		return {
			batch: {
				...listed,
				...extra
			},
			sessions,
			nextPastRank: past.nextRank,
			nextUpcomingRank: upcoming.nextRank
		};
});
export const loadBatchSchedule = defineService({ method: "POST" }).validator((d: unknown) => BatchScheduleInput.parse(d)).handler(async ({ data }): Promise<{ sessions: BatchSession[]; nextRank: number | null }> => {
		return loadScheduleMany(data.uid, data.past, 4, data.rank);
});
