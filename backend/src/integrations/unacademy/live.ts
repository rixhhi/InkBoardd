import { defineService } from "@/lib/server-fn.ts";
import { fetchWithRetry } from "@inkboard/shared/fetch-retry";
import { isUnacademyHost } from "@inkboard/shared/cdn-proxy";
import { swr } from "@/lib/swr-cache";
import { studioAvatar } from "@inkboard/shared/media-cover";
import {
  lessonStatus,
  pickNotes,
  pickReplayId,
} from "@inkboard/shared/parse-lesson";
import {
  ClassDetailInput,
  LiveSlideInput,
} from "@inkboard/shared/ua-input";
import { parseLiveSession, type LiveSession } from "@inkboard/shared/live-session";
import { FIRST_SLIDE_URL, firstSlideBody, firstSlideHasName, isFirstSlideHost, jwtFields, parseFirstSlideBody, pullLiveHistory } from "@inkboard/shared/live-dcn";
import type {
  LiveSlot,
} from "./types.ts";
import {
  logUa,
  onFail,
  UA_JSON,
  asObj,
  asStr,
  asNum,
  asArr,
  fetchJson,
  fetchText,
  nextData,
  replayFromCourseLessons,
  courseSlugOf,
  loadScheduleSlice,
  emptyClass,
  LIVE_GOALS,
  PLUS_BATCHES,
  isIstToday,
  parseFeedSlot,
  slotFromSession,
} from "./support.ts";

export const loadClassDetail = defineService({ method: "POST" }).validator((d: unknown) => ClassDetailInput.parse(d)).handler(async ({ data }) => {
	try {
		const nd = nextData(await fetchText(`https://unacademy.com/class/${encodeURIComponent(data.slug)}/${data.uid}`, 16e3));
		if (!nd) return emptyClass(data.uid, data.slug);
		const cf = asObj(asObj(asObj(asObj(nd).props).pageProps).classFallbackData);
		if (!asStr(cf.uid || cf.name)) return emptyClass(data.uid, data.slug);
		const author = asObj(cf.author);
		const programme = asObj(cf.programme);
		const courseUid = asStr(programme.uid) || asStr(asObj(asObj(asObj(nd).props).pageProps).courseUID);
		const courseSlug = asStr(programme.slug) || courseSlugOf(programme) || courseSlugOf(cf);
		let replayId = pickReplayId(cf) || pickReplayId(asObj(cf.liveClass || cf.live_class));
		if (!replayId && courseUid) {
			replayId = await replayFromCourseLessons(courseUid, courseSlug, asStr(cf.uid) || data.uid);
		}
		const notes = pickNotes(cf);
		const hlsUrls = asArr(asObj(cf.llhls).urls).map(asStr).filter(Boolean);
		const liveAt = asStr(cf.liveAt || cf.live_at) || null;
		const status = lessonStatus(replayId, liveAt, asNum(cf.state));
		return {
			uid: asStr(cf.uid) || data.uid,
			title: asStr(cf.name || cf.title) || "Live class",
			slug: asStr(cf.slug) || data.slug,
			authorName:
				`${asStr(author.firstName || author.first_name)} ${asStr(author.lastName || author.last_name)}`.trim() ||
				asStr(author.name),
			authorUsername: asStr(author.username),
			authorAvatar: studioAvatar(author.avatar_v2, author.avatar_v1_web, author.avatar_v1, author.old_avatar, author.avatar),
			courseUid,
			courseSlug,
			courseName: asStr(programme.name),
			liveAt,
			durationSec: asNum(cf.videoDuration ?? cf.taughtTime),
			status,
			replayId,
			notesUrl: notes.notesUrl,
			slidesUrl: notes.slidesUrl,
			hlsUrls,
			livePlayer: asStr(cf.liveClassUrl) || "https://player.uacdn.net/liveweb/v4036/index.html",
			attendance: asNum(cf.attendance)
		};
	} catch (err) {
		logUa(`class.${data.uid}`, err);
		return emptyClass(data.uid, data.slug);
	}
});
export const loadLiveSession = defineService({ method: "POST" })
	.validator((d: unknown) => ClassDetailInput.parse(d))
	.handler(async ({ data }): Promise<LiveSession> => {
		try {
			const res = await fetchWithRetry(`https://unacademy.com/api/v1/uplus/classes/${data.uid}/token/`, {
				headers: UA_JSON,
				timeoutMs: 12_000,
				retries: 1,
				allowed: isUnacademyHost,
			});
			const body = await res.json().catch(() => ({}));
			return parseLiveSession(data.uid, body, res.status);
		} catch (err) {
			logUa(`live-token.${data.uid}`, err);
			return parseLiveSession(data.uid, { message: "This door did not open" }, 502);
		}
	});
export const loadLiveSlide = defineService({ method: "POST" })
	.validator((d: unknown) => LiveSlideInput.parse(d))
	.handler(async ({ data }): Promise<{ url: string }> => {
		const body = firstSlideBody({
			className: data.className,
			courseName: data.courseName,
			educatorName: data.educatorName,
			rank: data.rank,
			special: data.special,
			theme: data.theme,
		});
		if (!firstSlideHasName(body)) return { url: "" };
		try {
			const res = await fetchWithRetry(FIRST_SLIDE_URL, {
				method: "POST",
				headers: {
					...UA_JSON,
					"Content-Type": "application/json",
					Accept: "text/plain, application/json, */*",
				},
				body: JSON.stringify(body),
				timeoutMs: 8_000,
				retries: 1,
				allowed: isFirstSlideHost,
			});
			const raw = await res.text();
			return { url: parseFirstSlideBody(raw) };
		} catch (err) {
			logUa(`live-slide.${data.uid}`, err);
			return { url: "" };
		}
	});
export const loadLiveHistory = defineService({ method: "POST" })
	.validator((d: unknown) => ClassDetailInput.parse(d))
	.handler(async ({ data }): Promise<{ packed: string }> => {
		try {
			const res = await fetchWithRetry(`https://unacademy.com/api/v1/uplus/classes/${data.uid}/token/`, {
				headers: UA_JSON,
				timeoutMs: 12_000,
				retries: 1,
				allowed: isUnacademyHost,
			});
			const body = await res.json().catch(() => ({}));
			const session = parseLiveSession(data.uid, body, res.status);
			if (!session.jwt) return { packed: "[]" };
			const fields = jwtFields(session.jwt);
			const events = await pullLiveHistory({
				jwt: session.jwt,
				classId: data.uid,
				goalUid: fields.goalUid,
				uid: fields.uid,
				wsDomain: session.wsDomain,
				ms: 1_800,
			});
			return { packed: JSON.stringify(events) };
		} catch (err) {
			logUa(`live-history.${data.uid}`, err);
			return { packed: "[]" };
		}
	});
export const loadLiveFeed = defineService({ method: "POST" }).handler(async (): Promise<{ live: LiveSlot[]; later: LiveSlot[] }> => {
	return swr("live-feed", 20_000, async () => {
		const homes = await Promise.all(LIVE_GOALS.map((goal) => fetchJson(`https://api-frontend.unacademy.com/api/v1/uplus/special_class/home/?goal_uid=${goal}`).catch(onFail("fetch", null))));
		const batch = await loadScheduleSlice(PLUS_BATCHES[0] ?? "", false).catch(onFail("live.batch", {
			sessions: [],
			nextRank: null
		}));
		const map = new Map();
		for (const home of homes) for (const block of asArr(asObj(home).results)) {
			const b = asObj(block);
			const kind = asStr(b.type);
			if (kind !== "live_now" && kind !== "upcoming") continue;
			for (const item of asArr(b.data)) {
				const slot = parseFeedSlot(item);
				if (!slot) continue;
				if (slot.status !== "live" && slot.status !== "upcoming") continue;
				if (slot.status === "upcoming" && !isIstToday(slot.liveAt)) continue;
				map.set(slot.classUid, slot);
			}
		}
		for (const s of batch.sessions) {
			if (s.status !== "live" && s.status !== "upcoming") continue;
			if (s.status === "upcoming" && !isIstToday(s.liveAt)) continue;
			if (!map.has(s.uid)) map.set(s.uid, slotFromSession(s));
		}
		const all = [...map.values()].sort((a, b) => {
			return (a.liveAt ? new Date(a.liveAt).getTime() : 0) - (b.liveAt ? new Date(b.liveAt).getTime() : 0);
		});
		return {
			live: all.filter((s) => s.status === "live"),
			later: all.filter((s) => s.status === "upcoming")
		};
	});
});
