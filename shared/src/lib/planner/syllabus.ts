import { diffDays } from "./dates.ts";
import { asLessons, liveTasks, type PlanCourseInput, type PlanTask, type StudyPlan } from "./types.ts";

export type TopicCoverage = {
  subject: string;
  planned: number;
  studied: number;
  remaining: number;
  hoursPlanned: number;
  hoursStudied: number;
  risk: "ok" | "watch" | "behind";
  etaDays: number | null;
};

export type TopicRow =
  | (TopicCoverage & { kind: "topic"; topic: string })
  | { kind: "unavailable"; courseId: string; courseTitle: string; subject: string; reason: "no-topics" | "untagged" };

function riskFor(planned: number, studied: number, remaining: number, pace: number, exam: string | null, today?: string): TopicCoverage["risk"] {
  const ratio = planned ? studied / planned : 1;
  const etaDays = remaining ? Math.ceil(remaining / pace) : 0;
  if (exam && today) {
    const left = diffDays(exam, today);
    if (etaDays > left) return "behind";
    if (etaDays > left - 7) return "watch";
    return "ok";
  }
  if (ratio < 0.35 && planned >= 4) return "behind";
  if (ratio < 0.55 && planned >= 4) return "watch";
  return "ok";
}

export function syllabusCoverage(plan: StudyPlan, today?: string): TopicCoverage[] {
  const map = new Map<string, TopicCoverage>();
  for (const t of liveTasks(plan.tasks).filter((x) => x.type === "lesson")) {
    const course = plan.courses.find((c) => c.courseId === t.courseId);
    const subject = t.subject || course?.subject || course?.title || t.teacher || "Other";
    const cur = map.get(subject) ?? {
      subject,
      planned: 0,
      studied: 0,
      remaining: 0,
      hoursPlanned: 0,
      hoursStudied: 0,
      risk: "ok" as const,
      etaDays: null,
    };
    cur.planned += 1;
    cur.hoursPlanned += t.durationMin;
    if (t.status === "done") {
      cur.studied += 1;
      cur.hoursStudied += t.durationMin;
    } else if (t.status === "pending") {
      cur.remaining += 1;
    }
    map.set(subject, cur);
  }
  const pace = Math.max(1, plan.prefs.lecturesPerDay);
  const exam = plan.prefs.examDate;
  return [...map.values()]
    .map((c) => {
      const etaDays = c.remaining ? Math.ceil(c.remaining / pace) : 0;
      return { ...c, risk: riskFor(c.planned, c.studied, c.remaining, pace, exam, today), etaDays };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

function lessonTopicOf(plan: StudyPlan, task: PlanTask): string | null {
  const course = plan.courses.find((c) => c.courseId === task.courseId);
  const lesson = asLessons(course?.lessons).find((l) => l.lessonId === task.lessonId);
  const fromLesson = lesson?.topic?.trim();
  if (fromLesson) return fromLesson;
  const topics = course?.topics ?? [];
  if (topics.length === 1 && topics[0]?.name.trim()) return topics[0].name.trim();
  return null;
}

function courseHasTopicData(course: PlanCourseInput): boolean {
  if ((course.topics ?? []).some((t) => t.name.trim())) return true;
  return asLessons(course.lessons).some((l) => Boolean(l.topic?.trim()));
}

function unavailableCopy(reason: "no-topics" | "untagged", title: string): string {
  if (reason === "untagged") return `Coverage unavailable for ${title} — lectures aren't tagged by topic.`;
  return `Coverage unavailable for ${title} — this course has no topic list.`;
}

export { unavailableCopy };

/** Topic-level coverage. Courses with no Unacademy topics are marked unavailable — never 0%. */
export function topicCoverage(plan: StudyPlan, today?: string): TopicRow[] {
  const pace = Math.max(1, plan.prefs.lecturesPerDay);
  const exam = plan.prefs.examDate;
  const map = new Map<string, TopicCoverage & { kind: "topic"; topic: string }>();
  const unavailable: Extract<TopicRow, { kind: "unavailable" }>[] = [];
  const seen = new Set<string>();
  const mappedCourses = new Set<string>();


  for (const course of plan.courses) {
    if (!courseHasTopicData(course) && !seen.has(course.courseId)) {
      seen.add(course.courseId);
      unavailable.push({
        kind: "unavailable",
        courseId: course.courseId,
        courseTitle: course.title,
        subject: course.subject || course.title,
        reason: "no-topics",
      });
    }
  }

  for (const t of liveTasks(plan.tasks).filter((x) => x.type === "lesson")) {
    const topic = lessonTopicOf(plan, t);
    if (!topic) continue;
    if (t.courseId) mappedCourses.add(t.courseId);
    const course = plan.courses.find((c) => c.courseId === t.courseId);
    const subject = t.subject || course?.subject || topic;
    const key = `${subject}::${topic}`;
    const cur = map.get(key) ?? {
      kind: "topic" as const,
      topic,
      subject,
      planned: 0,
      studied: 0,
      remaining: 0,
      hoursPlanned: 0,
      hoursStudied: 0,
      risk: "ok" as const,
      etaDays: null,
    };
    cur.planned += 1;
    cur.hoursPlanned += t.durationMin;
    if (t.status === "done") {
      cur.studied += 1;
      cur.hoursStudied += t.durationMin;
    } else if (t.status === "pending") {
      cur.remaining += 1;
    }
    map.set(key, cur);
  }

  for (const course of plan.courses) {
    if (!courseHasTopicData(course) || seen.has(course.courseId) || mappedCourses.has(course.courseId)) continue;
    seen.add(course.courseId);
      unavailable.push({
        kind: "unavailable",
        courseId: course.courseId,
        courseTitle: course.title,
        subject: course.subject || course.title,
        reason: "untagged",
      });
  }

  const topics = [...map.values()]
    .map((c) => {
      const etaDays = c.remaining ? Math.ceil(c.remaining / pace) : 0;
      return { ...c, risk: riskFor(c.planned, c.studied, c.remaining, pace, exam, today), etaDays };
    })
    .sort((a, b) => a.topic.localeCompare(b.topic) || a.subject.localeCompare(b.subject));
  return [...topics, ...unavailable];
}

export function suggestCourses(
  courses: { uid: string; name: string; topic: string; lessonCount: number; authorName: string; authorUsername: string }[],
): { subject: string; course: (typeof courses)[0] }[] {
  const by = new Map<string, (typeof courses)[0]>();
  for (const c of courses) {
    const subject = c.topic || "General";
    const cur = by.get(subject);
    if (!cur || c.lessonCount > cur.lessonCount) by.set(subject, c);
  }
  return [...by.entries()].map(([subject, course]) => ({ subject, course }));
}

export function hoursForCourse(course: PlanCourseInput, speed: number): { playable: number; hours: number; skipped: number } {
  let playable = 0;
  let minutes = 0;
  let skipped = 0;
  for (const l of asLessons(course.lessons)) {
    const ok = l.playable || l.status === "replay";
    if (!ok || l.status === "upcoming" || l.status === "archived" || l.status === "unavailable") {
      skipped += 1;
      continue;
    }
    playable += 1;
    const sec = l.durationSec > 0 ? l.durationSec : 20 * 60;
    minutes += Math.ceil(sec / Math.max(1, speed) / 60) + 10;
  }
  return { playable, hours: Math.round((minutes / 60) * 10) / 10, skipped };
}

export function milestoneProgress(plan: StudyPlan, subject: string, by: string) {
  const row = syllabusCoverage(plan).find((c) => c.subject.toLowerCase() === subject.toLowerCase());
  const remaining = row?.remaining ?? 0;
  const planned = row?.planned ?? 0;
  const studied = row?.studied ?? 0;
  return { remaining, planned, studied, by, onTrack: remaining === 0 || Boolean(row && row.risk !== "behind") };
}
