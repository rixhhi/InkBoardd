import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  POMODORO_PRESETS,
  advancePomodoro,
  bindFromSubject,
  bindFromTask,
  customPreset,
  formatClock,
  nextPhase,
  pausePomodoro,
  phaseSeconds,
  pomodoroClock,
  pomodoroLine,
  readPomodoro,
  resetPomodoro,
  resumePomodoro,
  startPomodoro,
  stopPomodoro,
} from "./pomodoro.ts";
import { readSessions, resetSessions } from "./sessions.ts";
import type { PlanTask } from "./types.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const task: PlanTask = {
  id: "t1",
  date: "2026-10-28",
  orderIdx: 0,
  type: "lesson",
  lessonId: "L1",
  courseId: "C1",
  title: "Rotational motion",
  teacher: "x",
  durationMin: 40,
  status: "pending",
  completedAt: null,
  rescheduledCount: 0,
  notesUrl: null,
  dppUrl: null,
  minutesLogged: 0,
  updatedAt: "",
  deletedAt: null,
  pinned: false,
  refLessonIds: [],
  note: "",
  subject: "Physics",
};

describe("pomodoro", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
    resetPomodoro();
    resetSessions();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    resetPomodoro();
    resetSessions();
  });

  it("binds a block to a task (lesson, course, subject) or to a bare category", () => {
    const b = bindFromTask(task, "p1");
    assert.equal(b.taskId, "t1");
    assert.equal(b.lessonId, "L1");
    assert.equal(b.courseId, "C1");
    assert.equal(b.subject, "physics");
    assert.equal(b.planId, "p1");
    const c = bindFromSubject("maths");
    assert.equal(c.taskId, null);
    assert.equal(c.title, "Maths");
  });

  it("runs a 25-minute work phase, pauses without losing time, and resumes", () => {
    const t0 = 1_000_000;
    startPomodoro(bindFromTask(task), POMODORO_PRESETS[0], t0);
    let clock = pomodoroClock(readPomodoro()!, t0 + 10 * 60_000);
    assert.equal(clock.phase, "work");
    assert.equal(clock.leftSec, 15 * 60);
    assert.equal(clock.pct, 40);
    pausePomodoro(t0 + 10 * 60_000);
    clock = pomodoroClock(readPomodoro()!, t0 + 50 * 60_000); // 40 min paused
    assert.equal(clock.leftSec, 15 * 60, "paused clock does not move");
    resumePomodoro(t0 + 50 * 60_000);
    clock = pomodoroClock(readPomodoro()!, t0 + 55 * 60_000);
    assert.equal(clock.leftSec, 10 * 60);
    assert.equal(pomodoroLine(readPomodoro()!, t0 + 55 * 60_000), "10:00 · Rotational motion");
  });

  it("logs a finished work phase as a focus session under the bound subject and lesson, then moves to a break", () => {
    const t0 = 2_000_000;
    startPomodoro(bindFromTask(task, "p1"), POMODORO_PRESETS[0], t0);
    const { state, logged } = advancePomodoro(t0 + 25 * 60_000);
    assert.ok(logged);
    assert.equal(logged.durationMin, 25);
    assert.equal(logged.subject, "physics");
    assert.equal(logged.lessonId, "L1");
    assert.equal(logged.taskId, "t1");
    assert.equal(logged.source, "focus");
    assert.equal(readSessions().length, 1);
    assert.equal(state?.phase, "break");
    assert.equal(state?.round, 1);
    assert.equal(state?.loggedWorkSec, 25 * 60);
  });

  it("gives a long break after the last round and does not log breaks", () => {
    const p = POMODORO_PRESETS[0]!;
    assert.deepEqual(nextPhase({ phase: "work", round: 1, preset: p }), { phase: "break", round: 1 });
    assert.deepEqual(nextPhase({ phase: "break", round: 1, preset: p }), { phase: "work", round: 2 });
    assert.deepEqual(nextPhase({ phase: "work", round: 4, preset: p }), { phase: "long", round: 4 });
    assert.deepEqual(nextPhase({ phase: "long", round: 4, preset: p }), { phase: "work", round: 5 });
    const t0 = 3_000_000;
    startPomodoro(bindFromSubject("chemistry"), p, t0);
    advancePomodoro(t0 + 25 * 60_000); // work → break, logs
    const { logged } = advancePomodoro(t0 + 30 * 60_000); // break → work, must not log
    assert.equal(logged, null);
    assert.equal(readSessions().length, 1);
  });

  it("skips logging a work phase under a minute, but keeps partial work on stop", () => {
    const t0 = 4_000_000;
    startPomodoro(bindFromSubject("maths"), POMODORO_PRESETS[0], t0);
    const early = advancePomodoro(t0 + 20_000);
    assert.equal(early.logged, null);
    // now in break; skip to work and study 7 minutes then stop
    advancePomodoro(t0 + 25_000);
    const stop = stopPomodoro(t0 + 25_000 + 7 * 60_000);
    assert.ok(stop.logged);
    assert.equal(stop.logged.durationMin, 7);
    assert.equal(stop.totalWorkSec, 7 * 60);
    assert.equal(readPomodoro(), null, "stopped state is cleared");
  });

  it("custom presets are clamped and phase seconds never drop under a minute", () => {
    const c = customPreset(0, 500, -3, 99);
    assert.equal(c.workMin, 1);
    assert.equal(c.breakMin, 60);
    assert.equal(c.longBreakMin, 1);
    assert.equal(c.rounds, 12);
    assert.equal(phaseSeconds(c, "work"), 60);
    assert.equal(formatClock(65), "1:05");
    assert.equal(formatClock(-4), "0:00");
  });
});
