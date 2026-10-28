import { addCoverage, uniqueRatio } from "@inkboard/shared/planner/watch";
import type { WatchLog } from "@inkboard/shared/planner/types";
import { downloadNotesCopy } from "./notes-zip.ts";

export const SHELF_LEDGER_EVENT = "inkboard:shelf-ledger";
export const TAKE_SHEETS_EVENT = "inkboard:take-sheets";

export type LineState = "unwatched" | "resume" | "struck";
export type TeacherTab = "batches" | "courses" | "free";

export type ShelfLedgerPayload = {
  kicker: string;
  title: string;
  meta?: string;
  examId?: string;
  teacher?: string;
  course?: string;
  next?: string;
  notes?: number;
  notesGuessed?: number;
  coverage?: string;
} | null;

export function fmtDur(sec: number) {
  if (!sec) return "";
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

export function parseClock(raw: string | number | null | undefined) {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : 0;
  if (!raw) return 0;
  const h = /(\d+)\s*h/i.exec(raw);
  const m = /(\d+)\s*m/i.exec(raw);
  return (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0);
}

export function coverageRatio(logs: WatchLog[], lessonId: string, durationSec: number) {
  if (!lessonId || !(durationSec > 0)) return 0;
  const merged = logs
    .filter((w) => w.lessonId === lessonId)
    .flatMap((w) => w.ranges)
    .reduce((acc, [from, to]) => addCoverage(acc, from, to), [] as [number, number][]);
  return uniqueRatio(merged, durationSec);
}

export function lineState(opts: { watchedSec: number; durationSec: number; coverage?: number }): LineState {
  const watched = Number.isFinite(opts.watchedSec) ? opts.watchedSec : 0;
  const duration = Number.isFinite(opts.durationSec) ? opts.durationSec : 0;
  const coverage = opts.coverage ?? 0;
  if (coverage >= 0.9) return "struck";
  if (duration > 0 && watched > 8) {
    if (watched / duration >= 0.9 || duration - watched < 12) return "struck";
    return "resume";
  }
  return "unwatched";
}

export function nextOpenIndex(states: LineState[]) {
  return states.findIndex((s) => s !== "struck");
}

export function fromCourseCaption(name?: string | null) {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  if (!n) return "From another course";
  return `From ${n}`;
}

export function altReplayFootnote(lessons: { altReplay?: boolean; fromCourse?: string | null }[]) {
  const borrowed = lessons.filter((l) => l.altReplay);
  if (!borrowed.length) return "";
  const names = [
    ...new Set(
      borrowed
        .map((l) => (l.fromCourse ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  ];
  if (names.length === 1) {
    return borrowed.length === 1 ? `From ${names[0]}` : `${borrowed.length} from ${names[0]}`;
  }
  if (names.length > 1) return `${borrowed.length} from other courses`;
  return borrowed.length === 1 ? "From another course" : `${borrowed.length} from other courses`;
}

export function lessonStatusCaption(
  status: string,
  altReplay?: boolean,
  durationSec?: number,
  fromCourse?: string | null,
) {
  if (status === "live") return "Live";
  if (status === "archived") {
    return altReplay ? `${fromCourseCaption(fromCourse)} · notes available` : "Archived · notes available";
  }
  if (status === "replay") return altReplay ? fromCourseCaption(fromCourse) : "";
  if (status === "upcoming") return "Upcoming";
  if (durationSec != null && durationSec > 0 && durationSec < 60) return "Did not go live";
  if (durationSec === 8940 || durationSec === 9000) return "Did not go live";
  if (durationSec != null && durationSec >= 60) return "No replay";
  return "Did not go live";
}

export function shelfCoverageCopy(struck: number, total: number) {
  if (!total) return "";
  return `${Math.round((struck / total) * 100)}% covered`;
}

export function sheetsCopy(known: number, guessed = 0) {
  if (known <= 0 && guessed <= 0) return "";
  if (guessed > 0) return `${known} known + ${guessed} possible · take them`;
  return known === 1 ? "1 sheet · take them" : `${known} sheets · take them`;
}

export { downloadNotesCopy };

export function shelfEmptyCopy(query: string) {
  const q = query.trim();
  if (!q) {
    return {
      title: "Search classes and teachers",
      body: "A teacher username, an exam, or a class id.",
    };
  }
  return {
    title: `Nothing here for “${q}”`,
    body: "Try a username like agsir, or pick an exam first so results stay on that paper.",
  };
}

export function teacherShelfEmpty(
  tab: TeacherTab,
  opts: { filter?: string; hasBatches?: boolean } = {},
) {
  if (tab === "courses") {
    if (opts.filter?.trim()) {
      return {
        title: "No courses match that",
        body: "Clear the filter to see every course.",
      };
    }
    return {
      title: "No public courses listed",
      body: opts.hasBatches
        ? "Their batch work lives under Batches."
        : "They may still have batches or free classes.",
    };
  }
  if (tab === "batches") {
    return {
      title: "No batches listed",
      body: "Courses and free classes are still listed.",
    };
  }
  return {
    title: "No free classes listed",
    body: "Courses and batches are still listed.",
  };
}

export function setShelfLedger(payload: ShelfLedgerPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHELF_LEDGER_EVENT, { detail: payload }));
}

export function takeSheets() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TAKE_SHEETS_EVENT));
}
