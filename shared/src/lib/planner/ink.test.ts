import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { calibrate, fadesOn, firstGap, inkBand, inkItems, inkSeed, inkSummary, planReinks, reinkQueue, retentionAt, stabilityFor, strokePath, type InkItem } from "./ink.ts";
import { fillPrefs } from "./types.ts";
import { addDaysKey } from "./dates.ts";
import type { PlanTask, StudyPlan } from "./types.ts";

const DAY = "2026-10-29";

function task(over: Partial<PlanTask>): PlanTask {
  return {
    id: over.id ?? `t-${Math.random()}`,
    date: DAY,
    orderIdx: 0,
    type: "lesson",
    lessonId: null,
    courseId: "c1",
    title: "Lesson",
    teacher: "T",
    durationMin: 60,
    status: "pending",
    completedAt: null,
    rescheduledCount: 0,
    notesUrl: null,
    dppUrl: null,
    minutesLogged: 0,
    updatedAt: `${DAY}T00:00:00.000Z`,
    deletedAt: null,
    pinned: false,
    refLessonIds: [],
    note: "",
    ...over,
  };
}

function plan(tasks: PlanTask[], reviews: StudyPlan["reviews"] = []): StudyPlan {
  return {
    id: "p1",
    examId: "x",
    examName: "Exam",
    name: "Plan",
    prefs: { revisionIntervals: [1, 3, 7, 21] } as StudyPlan["prefs"],
    startDate: "2026-09-01",
    endDate: "2027-01-01",
    active: true,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    courses: [
      {
        courseId: "c1",
        title: "Physics crash course",
        teacher: "T",
        subject: "Physics",
        lessons: [
          { lessonId: "L1", title: "Kinematics", durationSec: 3600, rank: 1, week: 1, notesUrl: null, dppUrl: null, playable: true },
          { lessonId: "L2", title: "Laws of motion", durationSec: 3600, rank: 2, week: 1, notesUrl: null, dppUrl: null, playable: true },
          { lessonId: "L3", title: "Work and energy", durationSec: 3600, rank: 3, week: 2, notesUrl: null, dppUrl: null, playable: true },
        ],
      },
    ],
    tasks,
    reviews,
  };
}

test("retention is 1 on the touch day, monotone non-increasing, and in [0,1]", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 400 }), fc.double({ min: 0.5, max: 120, noNaN: true }), (a, b, s) => {
      const item = { lastTouch: "2026-01-01", stability: s };
      const d1 = addDaysKey("2026-01-01", Math.min(a, b));
      const d2 = addDaysKey("2026-01-01", Math.max(a, b));
      const r1 = retentionAt(item, d1);
      const r2 = retentionAt(item, d2);
      return r1 >= 0 && r1 <= 1 && r2 >= 0 && r2 <= 1 && r2 <= r1 + 1e-12 && retentionAt(item, "2026-01-01") === 1;
    }),
  );
});

test("days before the touch count as fully remembered", () => {
  assert.equal(retentionAt({ lastTouch: "2026-03-10", stability: 3 }, "2026-03-01"), 1);
});

test("a review that falls due is visibly fading, twice the gap is a ghost", () => {
  // Stage 0, no rating: stability = 1 day * 1.25.
  const s0 = stabilityFor([1, 3, 7, 21], 0, null);
  assert.ok(Math.abs(s0 - 1.25) < 1e-9);
  const item = { lastTouch: DAY, stability: stabilityFor([1, 3, 7, 21], 2, "ok") };
  // Stage 2 with ok: gap 7 * reviewGap factor; at the due day retention ~0.45 -> fading.
  const gapDays = Math.round(item.stability / 1.25);
  assert.equal(inkBand(retentionAt(item, addDaysKey(DAY, gapDays))), "fading");
  assert.equal(inkBand(retentionAt(item, addDaysKey(DAY, gapDays * 2))), "ghost");
  assert.equal(inkBand(retentionAt(item, DAY)), "crisp");
});

test("solid recalls earn more stability than shaky ones at the same stage", () => {
  const shaky = stabilityFor([1, 3, 7, 21], 3, "shaky");
  const ok = stabilityFor([1, 3, 7, 21], 3, "ok");
  const solid = stabilityFor([1, 3, 7, 21], 3, "solid");
  assert.ok(shaky < ok && ok < solid, `${shaky} < ${ok} < ${solid}`);
  // Stages past the last interval clamp to it rather than reading undefined.
  assert.ok(stabilityFor([1, 3], 9, "ok") >= stabilityFor([1, 3], 1, "ok"));
});

test("fadesOn is the first day retention is under the threshold", () => {
  fc.assert(
    fc.property(fc.double({ min: 0.5, max: 60, noNaN: true }), (s) => {
      const item = { lastTouch: "2026-05-01", stability: s };
      const day = fadesOn(item);
      const before = addDaysKey(day, -1);
      return retentionAt(item, day) <= 0.7 + 1e-9 && (before < "2026-05-01" || retentionAt(item, before) >= 0.7 - 1e-9);
    }),
  );
});

test("firstGap finds the first unwatched second and ignores the credits", () => {
  assert.equal(firstGap([], 3600), 0);
  assert.equal(firstGap([[0, 600]], 3600), 600);
  assert.equal(firstGap([[0, 600], [601, 1200]], 3600), 1200); // 1 s seam is not a gap
  assert.equal(firstGap([[0, 600], [900, 1200]], 3600), 600);
  assert.equal(firstGap([[0, 3500]], 3600), null); // last 3% is credits
  assert.equal(firstGap([[0, 10]], 0), null); // unknown length
  assert.equal(firstGap([[100, 500]], 3600), 0); // never started from the top
});

test("inkItems: one item per touched lesson, last touch is the latest of lecture/review/watch", () => {
  const p = plan(
    [
      task({ id: "a", lessonId: "L1", status: "done", completedAt: "2026-10-01T10:00:00.000Z", title: "Kinematics" }),
      task({ id: "b", lessonId: "L2", status: "done", completedAt: "2026-10-05T10:00:00.000Z", title: "Laws of motion" }),
      task({ id: "c", type: "revision", refLessonIds: ["L1"], status: "done", completedAt: "2026-10-20T10:00:00.000Z", title: "Review" }),
      task({ id: "d", lessonId: "L3", status: "pending" }),
    ],
    [{ lessonId: "L1", stage: 1, dueDate: "2026-10-23", lastRating: "ok", lectureDate: "2026-10-01", lectureCompletedOn: "2026-10-01" }],
  );
  const items = inkItems(p, [{ lessonId: "L2", date: "2026-10-12", seconds: 1800, ranges: [[0, 1800]], updatedAt: "2026-10-12T09:00:00.000Z" }]);
  // Oldest touch first within a subject: L2 (watched 10-12) before L1 (reviewed 10-20).
  assert.deepEqual(
    items.map((i) => i.lessonId),
    ["L2", "L1"],
  );
  const l1 = items.find((i) => i.lessonId === "L1")!;
  assert.equal(l1.lastTouch, "2026-10-20");
  assert.equal(l1.stage, 1);
  assert.equal(l1.rating, "ok");
  assert.equal(l1.subject, "physics");
  assert.equal(l1.courseTitle, "Physics crash course");
  const l2 = items.find((i) => i.lessonId === "L2")!;
  assert.equal(l2.lastTouch, "2026-10-12"); // watch after lecture completion wins
  assert.equal(l2.coverage, 0.5);
  assert.equal(l2.firstGapSec, 1800);
});

test("inkItems never crashes on empty or malformed plans", () => {
  const empty = plan([]);
  assert.deepEqual(inkItems(empty), []);
  const noCourses = { ...plan([task({ lessonId: "ZZ", status: "done", completedAt: "2026-10-02T00:00:00.000Z", title: "Orphan" })]), courses: [] };
  const items = inkItems(noCourses);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.title, "Orphan");
  assert.equal(items[0]!.subject, "other");
});

test("summary bands add up and the re-ink queue is lowest retention first", () => {
  const items = [
    { lastTouch: "2026-10-28", stability: 10 },
    { lastTouch: "2026-10-01", stability: 10 },
    { lastTouch: "2026-10-20", stability: 10 },
  ].map((x, i) => ({ ...x, lessonId: `L${i}`, title: `L${i}`, courseId: null, courseTitle: "", subject: "other" as const, due: null, stage: 0, rating: null, calibration: 1, coverage: 1, firstGapSec: null, durationSec: 0 }));
  const s = inkSummary(items, DAY);
  assert.equal(s.crisp + s.fading + s.ghost, 3);
  assert.equal(s.total, 3);
  assert.ok(s.mean > 0 && s.mean < 1);
  const q = reinkQueue(items, DAY);
  assert.equal(q[0]!.lessonId, "L1");
  assert.ok(!q.some((i) => i.lessonId === "L0"), "crisp items are not in the queue");
});

test("strokes are deterministic per seed, scale with coverage, and are valid path data", () => {
  const a = strokePath(inkSeed("lesson-1"), 120);
  const b = strokePath(inkSeed("lesson-1"), 120);
  const c = strokePath(inkSeed("lesson-2"), 120);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^M-?\d+(\.\d+)? -?\d+(\.\d+)?( C(-?\d+(\.\d+)? ){5}-?\d+(\.\d+)?)+$/);
  const lastX = (d: string) => Number(d.trim().split(" ").slice(-2)[0]);
  assert.ok(lastX(strokePath(1, 200, 0.5)) < lastX(strokePath(1, 200, 1)));
  assert.ok(lastX(strokePath(1, 200, 0)) >= 8, "coverage floor keeps a visible stub");
});

function item(over: Partial<InkItem> & { lessonId: string }): InkItem {
  return { title: over.lessonId, courseId: null, courseTitle: "", subject: "other", lastTouch: "2026-10-01", stability: 10, due: null, stage: 0, rating: null, calibration: 1, coverage: 1, firstGapSec: null, durationSec: 0, ...over };
}

test("calibration: shaky on a crisp prediction lowers it, solid on a ghost raises it, bounded", () => {
  assert.equal(calibrate(1, 0.9, "shaky"), 0.8);
  assert.equal(calibrate(1, 0.2, "solid"), 1.25);
  assert.equal(calibrate(1, 0.5, "shaky"), 1, "fading band: the model was not sure either way");
  assert.equal(calibrate(1, 0.9, "solid"), 1, "agreement at 1 stays at 1");
  assert.ok(calibrate(0.8, 0.9, "solid") > 0.8 && calibrate(0.8, 0.9, "solid") <= 1, "confirmed crisp recovers toward 1");
  fc.assert(
    fc.property(fc.double({ min: 0, max: 5, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom("shaky", "ok", "solid"), (prev, r, rating) => {
      const c = calibrate(prev, r, rating as "shaky" | "ok" | "solid");
      return c >= 0.5 && c <= 2;
    }),
  );
  assert.equal(calibrate(Number.NaN, 0.9, "shaky"), 0.8, "garbage previous value is treated as 1");
});

test("calibration feeds stability: a 0.5 multiplier halves the e-folding time", () => {
  const base = stabilityFor([1, 3, 7, 21], 2, "ok", 1);
  assert.ok(Math.abs(stabilityFor([1, 3, 7, 21], 2, "ok", 0.5) - base / 2) < 1e-9);
  assert.ok(Math.abs(stabilityFor([1, 3, 7, 21], 2, "ok", 2) - base * 2) < 1e-9);
  assert.equal(stabilityFor([1, 3, 7, 21], 2, "ok", 99), base * 2, "clamped at 2");
});

test("planReinks: worst first, only what fades by the deadline, spread across work days within a daily budget", () => {
  const prefs = fillPrefs({ dailyMinutes: 90, studyDays: [1, 2, 3, 4, 5], holidays: [], catchUpDay: null });
  const items = [
    item({ lessonId: "crisp", lastTouch: "2026-10-28", stability: 200 }),
    item({ lessonId: "ghost", lastTouch: "2026-09-01", stability: 10 }),
    item({ lessonId: "fading", lastTouch: "2026-10-20", stability: 12 }),
    item({ lessonId: "planned", lastTouch: "2026-09-01", stability: 10 }),
  ];
  // 2026-10-29 is a Thursday; Sat/Sun are off in these prefs.
  const drafts = planReinks(items, { from: "2026-10-29", until: "2026-11-04", prefs, limit: 5, minutesPerItem: 15, minutesPerDay: 15, alreadyPlanned: ["planned"] });
  assert.deepEqual(
    drafts.map((d) => d.lessonId),
    ["ghost", "fading"],
    "crisp is skipped, planned is skipped, ghost comes first",
  );
  assert.deepEqual(drafts.map((d) => d.date), ["2026-10-29", "2026-10-30"], "one per day at a 15-minute daily budget");
  assert.ok(drafts.every((d) => d.durationMin === 15));
  assert.ok(drafts[0]!.retentionAtUntil < drafts[1]!.retentionAtUntil);
  // Deadline before `from` collapses to `from`; weekend-only window still lands on a day.
  const weekend = planReinks(items, { from: "2026-10-31", until: "2026-11-01", prefs, limit: 2 });
  assert.ok(weekend.length === 2 && weekend.every((d) => d.date === "2026-10-31"), "no work day in range -> everything on `from`");
  assert.deepEqual(planReinks(items, { from: "2026-10-29", until: "2026-10-29", prefs, limit: 0 }), []);
});

test("planReinks: never schedules more than `limit`, never before `from`, dates ascend", () => {
  const prefs = fillPrefs({ dailyMinutes: 60 });
  fc.assert(
    fc.property(fc.array(fc.record({ id: fc.uuid(), age: fc.integer({ min: 0, max: 120 }), s: fc.double({ min: 0.5, max: 60, noNaN: true }) }), { maxLength: 30 }), fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 30 }), (rows, limit, span) => {
      const items = rows.map((r) => item({ lessonId: r.id, lastTouch: addDaysKey(DAY, -r.age), stability: r.s }));
      const drafts = planReinks(items, { from: DAY, until: addDaysKey(DAY, span), prefs, limit });
      const dates = drafts.map((d) => d.date);
      return drafts.length <= limit && dates.every((d) => d >= DAY) && dates.every((d, i) => i === 0 || d >= dates[i - 1]!) && new Set(drafts.map((d) => d.lessonId)).size === drafts.length;
    }),
  );
});
