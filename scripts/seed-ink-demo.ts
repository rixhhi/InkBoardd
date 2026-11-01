/**
 * Seed a realistic study plan into a member's synced planner state so the
 * Fading Ink board has something to draw. Uses the real scheduler and the real
 * sync API; nothing here bypasses the app.
 *
 *   node --experimental-strip-types scripts/seed-ink-demo.ts riya@inkboard.local riya-study-2026 [http://127.0.0.1:3000]
 *
 * The plan starts 6 weeks ago. Lectures scheduled before today are marked done
 * on their day; some reviews are rated (shaky/ok/solid) so stages differ; a
 * few lessons have partial watch logs so strokes are shorter.
 */
import { generatePlan } from "../shared/src/lib/planner/scheduler.ts";
import { addDaysKey, todayKey } from "../shared/src/lib/planner/dates.ts";
import { fillPrefs, PLANNER_KEY, type PlannerState, type PlanCourseInput, type StudyPlan, type WatchLog } from "../shared/src/lib/planner/types.ts";
import { reviewGap } from "../shared/src/lib/planner/scheduler/days.ts";

const [email, password, base = "http://127.0.0.1:3000"] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: seed-ink-demo.ts <email> <password> [base]");
  process.exit(2);
}

const today = todayKey();
const start = addDaysKey(today, -42);
const exam = addDaysKey(today, 38);

function lessons(prefix: string, titles: string[], base = 2700): PlanCourseInput["lessons"] {
  return titles.map((title, i) => ({ lessonId: `${prefix}-${i + 1}`, title, durationSec: base + ((i * 613) % 1500), rank: i + 1, week: Math.floor(i / 4) + 1, notesUrl: null, dppUrl: null, playable: true }));
}

const courses: PlanCourseInput[] = [
  {
    courseId: "phy-mech",
    title: "Mechanics for JEE",
    teacher: "Seep Pahuja",
    subject: "Physics",
    lessons: lessons("phy", ["Kinematics in one dimension", "Projectile motion", "Newton's laws", "Friction", "Work, energy and power", "Circular motion", "Centre of mass", "Rotational dynamics", "Gravitation", "Simple harmonic motion"]),
  },
  {
    courseId: "chem-phys",
    title: "Physical Chemistry crash course",
    teacher: "Rahul M",
    subject: "Chemistry",
    lessons: lessons("chem", ["Mole concept", "Atomic structure", "Chemical bonding", "States of matter", "Thermodynamics I", "Thermodynamics II", "Equilibrium", "Ionic equilibrium", "Electrochemistry"], 3000),
  },
  {
    courseId: "math-calc",
    title: "Calculus from zero",
    teacher: "Mohit Tyagi",
    subject: "Maths",
    lessons: lessons("math", ["Limits", "Continuity", "Differentiation", "Applications of derivatives", "Maxima and minima", "Indefinite integrals", "Definite integrals", "Area under curves", "Differential equations"], 3300),
  },
];

const prefs = fillPrefs({ startDate: start, examDate: exam, dailyMinutes: 150, studyDays: [1, 2, 3, 4, 5, 6], lecturesPerDay: 2 });
const gen = generatePlan(prefs, courses);
const tasks = gen.tasks.map((t) => ({ ...t }));

// Mark past lectures done on their day. Leave ~15% of the last two weeks undone so the Tasks page is not empty.
let i = 0;
for (const t of tasks) {
  if (t.date >= today) continue;
  const recent = t.date >= addDaysKey(today, -14);
  if (t.type === "lesson" && (!recent || i++ % 7 !== 3)) {
    t.status = "done";
    t.completedAt = `${t.date}T15:30:00.000Z`;
  }
}

// Rate the past revision tasks so stages diverge: physics mostly solid, chemistry ok, maths shaky.
const intervals = prefs.revisionIntervals;
const reviews = new Map<string, NonNullable<StudyPlan["reviews"]>[number]>();
const ratingFor = (lessonId: string) => (lessonId.startsWith("phy") ? "solid" : lessonId.startsWith("chem") ? "ok" : "shaky") as const;
for (const t of tasks) {
  if (t.type !== "revision" || t.date >= today) continue;
  // Skip a third of maths reviews so some lessons go a long time without a touch (ghosts).
  if (t.refLessonIds.some((id) => id.startsWith("math")) && Number(t.date.slice(-2)) % 3 === 0) continue;
  const rating = ratingFor(t.refLessonIds[0] ?? "");
  t.status = "done";
  t.completedAt = `${t.date}T16:00:00.000Z`;
  t.note = rating;
  for (const lessonId of t.refLessonIds) {
    const ex = reviews.get(lessonId);
    const stage = ex ? ex.stage + 1 : 1;
    const interval = reviewGap(intervals[Math.min(stage - 1, intervals.length - 1)] ?? 7, rating, stage);
    const lecture = tasks.find((x) => x.type === "lesson" && x.lessonId === lessonId);
    reviews.set(lessonId, { lessonId, stage, dueDate: addDaysKey(t.date, interval), lastRating: rating, lectureDate: lecture?.date ?? t.date, lectureCompletedOn: lecture?.date ?? t.date });
  }
}

// Partial watch logs: a few lessons only half watched.
const watchLogs: WatchLog[] = [
  { lessonId: "phy-6", date: addDaysKey(today, -9), seconds: 1500, ranges: [[0, 1500]], updatedAt: `${addDaysKey(today, -9)}T12:00:00.000Z` },
  { lessonId: "chem-5", date: addDaysKey(today, -4), seconds: 1200, ranges: [[0, 700], [1500, 2000]], updatedAt: `${addDaysKey(today, -4)}T12:00:00.000Z` },
  { lessonId: "math-4", date: addDaysKey(today, -2), seconds: 900, ranges: [[0, 900]], updatedAt: `${addDaysKey(today, -2)}T12:00:00.000Z` },
];

const plan: StudyPlan = {
  id: "plan-demo-jee",
  examId: "TMUVD",
  examName: "JEE Main 2027",
  name: "JEE Main · Jan attempt",
  prefs,
  startDate: start,
  endDate: exam,
  active: true,
  createdAt: `${start}T09:00:00.000Z`,
  updatedAt: new Date().toISOString(),
  deletedAt: null,
  courses,
  tasks,
  reviews: [...reviews.values()],
};

const days = Array.from(new Set(tasks.filter((t) => t.status === "done").map((t) => t.date))).map((date) => ({ date, minutesStudied: 90 + (Number(date.slice(-2)) % 5) * 15, tasksDone: tasks.filter((t) => t.date === date && t.status === "done").length, updatedAt: `${date}T18:00:00.000Z` }));

const state: PlannerState = { version: 3, plans: [plan], activePlanId: plan.id, days, freezeWeeks: [], watchLogs };

// Sign in, then PUT the state the same way the app's sync does.
const jar: string[] = [];
const headers = (extra: Record<string, string> = {}) => ({ "content-type": "application/json", origin: base, cookie: jar.join("; "), ...extra });
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: headers(), body: JSON.stringify({ email, password }) });
if (!login.ok) throw new Error(`login ${login.status}: ${await login.text()}`);
for (const c of login.headers.getSetCookie?.() ?? []) jar.push(c.split(";")[0]!);
const put = await fetch(`${base}/api/me/state`, { method: "PUT", headers: headers(), body: JSON.stringify({ entries: [{ key: PLANNER_KEY, value: JSON.stringify(state) }] }) });
const putBody = await put.text();
console.log("PUT /api/me/state", put.status, putBody);
if (!put.ok) throw new Error(`seed failed: PUT /api/me/state ${put.status}: ${putBody}`);
console.log(`seeded ${tasks.length} tasks, ${reviews.size} reviewed lessons, ${tasks.filter((t) => t.status === "done" && t.type === "lesson").length} lectures done, exam ${exam}`);
