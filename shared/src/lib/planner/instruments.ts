import { formatRemain } from "../folio.ts";
import { diffDays } from "./dates.ts";
import type { PaceStatus } from "./streaks.ts";

export const FORM_LEDGER_EVENT = "inkboard:form-ledger";

export type FormLedger = {
  kicker: string;
  title: string;
  lines: string[];
  warn?: string | null;
} | null;

export type PaceView = { status: PaceStatus; daysDelta: number };

const DAY_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export function dayPhrase(n: number): string {
  const abs = Math.abs(n);
  if (abs === 1) return "One day";
  if (abs <= 10) return `${DAY_WORDS[abs]} days`;
  return `${abs} days`;
}

export function paceSentence(pace: PaceView): string {
  if (pace.status === "on-track") return "You are on pace";
  const phrase = dayPhrase(pace.daysDelta);
  return pace.status === "ahead" ? `${phrase} ahead` : `${phrase} behind`;
}

export function instrumentFigures(opts: {
  streak: number;
  minutes: number;
  coverage: number;
  examDate: string | null;
  today: string;
}): { tally: number; minutes: number; coverage: number; daysToExam: number | null } {
  return {
    tally: Math.max(0, opts.streak),
    minutes: Math.max(0, Math.round(opts.minutes)),
    coverage: Math.max(0, Math.min(100, Math.round(opts.coverage))),
    daysToExam: opts.examDate ? diffDays(opts.examDate, opts.today) : null,
  };
}

export function daysToExamCopy(n: number | null): string {
  if (n == null) return "No exam date";
  if (n === 0) return "Exam today";
  if (n < 0) return `${dayPhrase(n)} past`;
  return dayPhrase(n);
}

export function tallyCopy(n: number): string {
  if (n <= 0) return "No streak";
  return n === 1 ? "1-day streak" : `${n}-day streak`;
}

export function coverageCopy(studied: number, planned: number): string {
  if (!planned) return "0% struck";
  return `${Math.round((studied / planned) * 100)}% struck`;
}

export function minutesCopy(n: number): string {
  return formatRemain(n);
}

export function rangeLabel(id: "7" | "30" | "90" | 7 | 30 | 90): string {
  return `${id}d`;
}

export function publishFormLedger(payload: FormLedger) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FORM_LEDGER_EVENT, { detail: payload }));
}
