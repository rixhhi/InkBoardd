import type { CoverageRange, WatchLog } from "./types.ts";
import { nowIso } from "./dates.ts";

/** Ignore a single timeupdate larger than this — it's a seek, not playback. */
export const MAX_TICK_SEC = 5;

export function playbackCredit(
  prevSec: number,
  nextSec: number,
  opts: { hidden?: boolean } = {},
): { creditSec: number; nextPrev: number } {
  if (opts.hidden) {
    return { creditSec: 0, nextPrev: nextSec };
  }
  if (!Number.isFinite(nextSec) || nextSec < 0) {
    return { creditSec: 0, nextPrev: prevSec };
  }
  if (!Number.isFinite(prevSec) || prevSec < 0) {
    return { creditSec: 0, nextPrev: nextSec };
  }
  const delta = nextSec - prevSec;
  if (delta <= 0 || delta > MAX_TICK_SEC) {
    return { creditSec: 0, nextPrev: nextSec };
  }
  return { creditSec: delta, nextPrev: nextSec };
}

export function addCoverage(ranges: CoverageRange[], from: number, to: number): CoverageRange[] {
  if (!(to > from) || !Number.isFinite(from) || !Number.isFinite(to)) return ranges;
  const all = [...ranges, [from, to] as CoverageRange].sort((a, b) => a[0] - b[0]);
  const out: CoverageRange[] = [];
  for (const r of all) {
    const last = out[out.length - 1];
    if (!last || r[0] > last[1] + 0.05) out.push([r[0], r[1]]);
    else last[1] = Math.max(last[1], r[1]);
  }
  return out;
}

export function coveredSeconds(ranges: CoverageRange[]): number {
  return ranges.reduce((n, [a, b]) => n + Math.max(0, b - a), 0);
}

export function uniqueRatio(ranges: CoverageRange[], durationSec: number): number {
  if (!(durationSec > 0)) return 0;
  return Math.min(1, coveredSeconds(ranges) / durationSec);
}

export function applyWatchTick(
  log: WatchLog | undefined,
  lessonId: string,
  date: string,
  prevSec: number,
  nextSec: number,
  hidden: boolean,
  now: Date = new Date(),
): { log: WatchLog; creditSec: number; nextPrev: number } {
  const { creditSec, nextPrev } = playbackCredit(prevSec, nextSec, { hidden });
  const base: WatchLog = log ?? { lessonId, date, seconds: 0, ranges: [], updatedAt: nowIso(now) };
  if (creditSec <= 0) {
    return { log: base, creditSec: 0, nextPrev };
  }
  const from = nextPrev - creditSec;
  const ranges = addCoverage(base.ranges, from, nextPrev);
  return {
    log: {
      lessonId,
      date,
      seconds: Math.round((coveredSeconds(ranges) + Number.EPSILON) * 10) / 10,
      ranges,
      updatedAt: nowIso(now),
    },
    creditSec,
    nextPrev,
  };
}

export const AUTO_COMPLETE_RATIO = 0.9;
