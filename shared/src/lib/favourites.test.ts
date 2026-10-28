import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  chapterIsComplete,
  combinedScore,
  continuePick,
  emptyChecks,
  lectureScore,
  placeFor,
  readFavourites,
  rememberPlace,
  setChecks,
  toggleFavourite,
} from "./favourites.ts";

function mockStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
    configurable: true,
  });
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("favourites", () => {
  it("stars and unstars a course", () => {
    mockStorage();
    assert.equal(toggleFavourite({ courseId: "C1", title: "Algebra", teacher: "rahul", teacherName: "Rahul", slug: "algebra" }), true);
    assert.equal(readFavourites()[0]?.title, "Algebra");
    assert.equal(toggleFavourite({ courseId: "C1", title: "Algebra", teacher: "rahul", teacherName: "Rahul", slug: "algebra" }), false);
    assert.equal(readFavourites().length, 0);
  });

  it("rolls four ticks into one score", () => {
    assert.equal(lectureScore(emptyChecks()), 0);
    assert.equal(lectureScore({ notes: true, questions: true, teacherQuestions: true, revision: true }), 1);
    assert.equal(lectureScore({ notes: true, questions: false, teacherQuestions: false, revision: false }), 0.25);
    const avg = combinedScore([
      { notes: true, questions: true, teacherQuestions: true, revision: true },
      emptyChecks(),
    ]);
    assert.equal(avg, 0.5);
  });

  it("marks a chapter complete only when every lecture is done or the student says so", () => {
    const done = { notes: true, questions: true, teacherQuestions: true, revision: true };
    assert.equal(chapterIsComplete(false, ["a", "b"], { a: done, b: done }), true);
    assert.equal(chapterIsComplete(false, ["a", "b"], { a: done, b: emptyChecks() }), false);
    assert.equal(chapterIsComplete(true, ["a"], { a: emptyChecks() }), true);
    assert.equal(chapterIsComplete(false, [], {}), false);
  });

  it("continues the lecture that was left unfinished", () => {
    const lessons = [
      { id: "L1", title: "One", duration: 1000, playable: true },
      { id: "L2", title: "Two", duration: 1000, playable: true },
    ];
    const now = Date.now();
    const pick = continuePick(lessons, [
      { lessonId: "L1", title: "One", courseId: "C", teacher: "", t: 990, duration: 1000, at: now },
      { lessonId: "L2", title: "Two", courseId: "C", teacher: "", t: 40, duration: 1000, at: now - 1000 },
    ]);
    assert.equal(pick?.lessonId, "L2");
    assert.equal(pick?.t, 40);
    assert.equal(pick?.finished, false);
  });

  it("remembers a place past the short history list", () => {
    mockStorage();
    rememberPlace({ lessonId: "R750YP86336TNLGSA0GF", title: "Counting", courseId: "D7", teacher: "rahul", t: 3120, duration: 6800 });
    setChecks("R750YP86336TNLGSA0GF", { notes: true, revision: true });
    assert.equal(placeFor("R750YP86336TNLGSA0GF")?.t, 3120);
  });
});
