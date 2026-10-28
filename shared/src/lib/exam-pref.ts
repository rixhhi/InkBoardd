import { useSyncExternalStore } from "react";
import { EXAMS, getExam, type Exam } from "./exams.ts";

const KEY = "inkboard.exam.v1";
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function readExamId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = localStorage.getItem(KEY);
    if (id && getExam(id)) return getExam(id)!.id;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeExamId(id: string) {
  const exam = getExam(id);
  if (!exam) return;
  try {
    localStorage.setItem(KEY, exam.id);
  } catch {
    /* ignore */
  }
  emit();
}

export function clearExamId() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function subscribeExam(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSelectedExam(): Exam | null {
  const id = useSyncExternalStore(subscribeExam, readExamId, () => null);
  return id ? (EXAMS.find((e) => e.id === id) ?? null) : null;
}
