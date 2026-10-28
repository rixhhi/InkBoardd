export const BACKUP_VERSION = 2;
export const PLANNER_KEY = "inkboard.planner.v1";
export const WATCH_KEY = "inkboard.planner.watch.v1";
export const DIRTY_KEY = "inkboard.planner.dirty.v1";
export const DATE_FMT = "yyyy-MM-dd";
export const TOMBSTONE_DAYS = 30;
export const WATCH_LOG_DAYS = 120;
export const WATCH_FLUSH_MS = 15_000;
export const HARD_MAX_LECTURES = 5;
export const DEFAULT_REVISION_INTERVALS = [1, 3, 7, 21];
export const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

export const WEEKDAYS = [
  { id: 1, label: "Mon", short: "M" },
  { id: 2, label: "Tue", short: "T" },
  { id: 3, label: "Wed", short: "W" },
  { id: 4, label: "Thu", short: "T" },
  { id: 5, label: "Fri", short: "F" },
  { id: 6, label: "Sat", short: "S" },
  { id: 0, label: "Sun", short: "S" },
] as const;

export type TimeSlot = "morning" | "afternoon" | "evening" | "night";
export type MixMode = "mix" | "one-subject";
export type PlaybackSpeed = 1 | 1.25 | 1.5 | 2;
export type TaskType = "lesson" | "revision" | "dpp" | "custom";
export type TaskStatus = "pending" | "done" | "skipped";
export type RescheduleStrategy = "push" | "spread" | "skip";
export type SyncStatus = "local-only" | "syncing" | "synced" | "offline" | "error";
export type PaceId = "relaxed" | "steady" | "intense" | "custom";
export type PlaylistMode = "rotate" | "sequential" | "blocks";
export type ReviewRating = "shaky" | "ok" | "solid";
export type EventKind = "study" | "mock" | "pyq" | "exam" | "holiday" | "note";

export const PLAN_COLORS = ["#8fbfa8", "#6d9a86", "#b8a99a", "#d06a58", "#e6e1d6", "#9aa39a"] as const;

export const PACE_LECTURES: Record<PaceId, number> = {
  relaxed: 2,
  steady: 3,
  intense: 4,
  custom: 3,
};

export const TIME_SLOTS: { id: TimeSlot; label: string; hint: string; hour: number }[] = [
  { id: "morning", label: "Morning", hint: "6–10am", hour: 7 },
  { id: "afternoon", label: "Afternoon", hint: "12–4pm", hour: 13 },
  { id: "evening", label: "Evening", hint: "6–10pm", hour: 19 },
  { id: "night", label: "Night", hint: "10pm–1am", hour: 22 },
];

export const SPEEDS: PlaybackSpeed[] = [1, 1.25, 1.5, 2];

export type PlannerPrefs = {
  startDate: string;
  examDate: string | null;
  studyDays: number[];
  dailyMinutes: number;
  timeSlot: TimeSlot;
  catchUpDay: number | null;
  speed: PlaybackSpeed;
  includeRevision: boolean;
  mixMode: MixMode;
  streakMinutes: number;
  holidays: string[];
  includeDpp: boolean;
  reminders: boolean;
  reminderHour: number | null;
  quietStart: number | null;
  quietEnd: number | null;
  pace: PaceId;
  lecturesPerDay: number;
  hardMaxLecturesPerDay: number;
  maxNewMinutesPerDay: number;
  revisionShare: number;
  revisionIntervals: number[];
  playlistMode: PlaylistMode;
  restEvery: number;
};

export const DEFAULT_PREFS: PlannerPrefs = {
  startDate: "",
  examDate: null,
  studyDays: [1, 2, 3, 4, 5, 6],
  dailyMinutes: 90,
  timeSlot: "evening",
  catchUpDay: 0,
  speed: 1,
  includeRevision: true,
  mixMode: "mix",
  streakMinutes: 20,
  holidays: [],
  includeDpp: false,
  reminders: false,
  reminderHour: null,
  quietStart: null,
  quietEnd: null,
  pace: "steady",
  lecturesPerDay: 3,
  hardMaxLecturesPerDay: 5,
  maxNewMinutesPerDay: 150,
  revisionShare: 0.25,
  revisionIntervals: [...DEFAULT_REVISION_INTERVALS],
  playlistMode: "rotate",
  restEvery: 6,
};

export type PlanLessonInput = {
  lessonId: string;
  title: string;
  durationSec: number;
  rank: number;
  week: number | null;
  notesUrl: string | null;
  dppUrl: string | null;
  playable: boolean;
  status?: string;
  topic?: string;
};

export type PlanCourseInput = {
  courseId: string;
  title: string;
  teacher: string;
  teacherUsername?: string;
  subject?: string;
  topics?: { uid: string; name: string }[];
  lessons: PlanLessonInput[];
};

export type CoverageRange = [number, number];

export type WatchLog = {
  lessonId: string;
  date: string;
  seconds: number;
  ranges: CoverageRange[];
  updatedAt: string;
};

export type LessonReviewState = {
  lessonId: string;
  stage: number;
  dueDate: string | null;
  lastRating: ReviewRating | null;
  lectureDate: string;
  lectureCompletedOn: string | null;
};

export type PlanTask = {
  id: string;
  date: string;
  orderIdx: number;
  type: TaskType;
  lessonId: string | null;
  courseId: string | null;
  title: string;
  teacher: string;
  durationMin: number;
  status: TaskStatus;
  completedAt: string | null;
  rescheduledCount: number;
  notesUrl: string | null;
  dppUrl: string | null;
  minutesLogged: number;
  updatedAt: string;
  deletedAt: string | null;
  pinned: boolean;
  refLessonIds: string[];
  note: string;
  eventKind?: EventKind;
  subject?: string;
  plannedDate?: string;
};

export type StudyDayLog = {
  date: string;
  minutesStudied: number;
  tasksDone: number;
  updatedAt: string;
};

export type StudyPlan = {
  id: string;
  examId: string;
  examName: string;
  name: string;
  prefs: PlannerPrefs;
  startDate: string;
  endDate: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  courses: PlanCourseInput[];
  tasks: PlanTask[];
  reviews?: LessonReviewState[];
  color?: string;
  archived?: boolean;
};

export type PlannerState = {
  version: number;
  plans: StudyPlan[];
  activePlanId: string | null;
  days: StudyDayLog[];
  freezeWeeks: string[];
  watchLogs: WatchLog[];
};

export const EMPTY_STATE: PlannerState = {
  version: 3,
  plans: [],
  activePlanId: null,
  days: [],
  freezeWeeks: [],
  watchLogs: [],
};

export type DirtySet = {
  plans: string[];
  tasks: string[];
  days: string[];
  watch: string[];
  sessions: string[];
  journal: string[];
  badges: string[];
  freeze: boolean;
  full: boolean;
};

export const EMPTY_DIRTY: DirtySet = {
  plans: [],
  tasks: [],
  days: [],
  watch: [],
  sessions: [],
  journal: [],
  badges: [],
  freeze: false,
  full: false,
};

export type DeltaTask = PlanTask & { planId: string };

export type PlannerDelta = {
  plans: StudyPlan[];
  tasks: DeltaTask[];
  days: StudyDayLog[];
  watchLogs: WatchLog[];
  freezeWeeks: string[] | null;
  activePlanId: string | null;
  full: boolean;
};

export type FeasibilityOptions = {
  raisePaceTo: PaceId | null;
  extendExamDateBy: number;
  dropPlaylistSuggestions: { courseId: string; title: string; lessonCount: number }[];
  finishDateAtCurrentPace: string;
  requiredLecturesPerDay: number;
};

export type PlanSummary = {
  lessonCount: number;
  revisionCount: number;
  playableSkipped: number;
  totalMinutes: number;
  totalHours: number;
  finishDate: string;
  examDate: string | null;
  fitsBeforeExam: boolean | null;
  requiredMinutesPerDay: number | null;
  requiredLecturesPerDay: number | null;
  warning: string | null;
  feasibility: FeasibilityOptions | null;
};

export type GenerateResult = {
  tasks: PlanTask[];
  startDate: string;
  endDate: string;
  summary: PlanSummary;
  reviews: LessonReviewState[];
};

export type PlanDiff = {
  moved: number;
  skipped: number;
  added: number;
  removed: number;
  finishBefore: string | null;
  finishAfter: string | null;
};

export function asLessons(value: unknown): PlanLessonInput[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is PlanLessonInput => Boolean(row && typeof (row as PlanLessonInput).lessonId === "string"),
  );
}

export function watchKeyOf(lessonId: string, date: string) {
  return `${lessonId}:${date}`;
}

export function liveTasks(tasks: PlanTask[]): PlanTask[] {
  return tasks.filter((t) => !t.deletedAt);
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function inferPace(lecturesPerDay: number | undefined): PaceId {
  if (lecturesPerDay === 2) return "relaxed";
  if (lecturesPerDay === 3) return "steady";
  if (lecturesPerDay === 4) return "intense";
  if (lecturesPerDay === 1 || lecturesPerDay === 5) return "custom";
  return "steady";
}

export function fillPrefs(over: Partial<PlannerPrefs> = {}): PlannerPrefs {
  const pace = over.pace ?? inferPace(over.lecturesPerDay);
  const lecturesPerDay = clamp(over.lecturesPerDay ?? PACE_LECTURES[pace], 1, HARD_MAX_LECTURES);
  const playlistMode = over.playlistMode ?? (over.mixMode === "one-subject" ? "sequential" : DEFAULT_PREFS.playlistMode);
  const mixMode = over.mixMode ?? (playlistMode === "rotate" ? "mix" : "one-subject");
  return {
    ...DEFAULT_PREFS,
    ...over,
    pace,
    lecturesPerDay,
    hardMaxLecturesPerDay: HARD_MAX_LECTURES,
    maxNewMinutesPerDay: clamp(over.maxNewMinutesPerDay ?? DEFAULT_PREFS.maxNewMinutesPerDay, 20, 480),
    revisionShare: over.revisionShare ?? DEFAULT_PREFS.revisionShare,
    revisionIntervals:
      over.revisionIntervals?.length
        ? over.revisionIntervals.filter((n) => n > 0)
        : [...DEFAULT_REVISION_INTERVALS],
    playlistMode,
    restEvery: over.restEvery == null ? DEFAULT_PREFS.restEvery : Math.max(0, over.restEvery),
    mixMode,
    holidays: over.holidays ?? [],
    includeDpp: Boolean(over.includeDpp ?? DEFAULT_PREFS.includeDpp),
    includeRevision: over.includeRevision ?? DEFAULT_PREFS.includeRevision,
    reminders: Boolean(over.reminders ?? DEFAULT_PREFS.reminders),
    reminderHour:
      over.reminderHour == null || !Number.isFinite(over.reminderHour) ? null : clamp(over.reminderHour, 0, 23),
    quietStart: over.quietStart == null || !Number.isFinite(over.quietStart) ? null : clamp(over.quietStart, 0, 23),
    quietEnd: over.quietEnd == null || !Number.isFinite(over.quietEnd) ? null : clamp(over.quietEnd, 0, 23),
    studyDays: over.studyDays?.length ? over.studyDays : DEFAULT_PREFS.studyDays,
  };
}

export function fillTask(over: Partial<PlanTask> & { id: string }): PlanTask {
  const plannedDate = over.plannedDate || over.date || "";
  return {
    date: "",
    orderIdx: 0,
    type: "lesson",
    lessonId: null,
    courseId: null,
    title: "Class",
    teacher: "",
    durationMin: 30,
    status: "pending",
    completedAt: null,
    rescheduledCount: 0,
    notesUrl: null,
    dppUrl: null,
    minutesLogged: 0,
    updatedAt: EPOCH_ISO,
    deletedAt: null,
    pinned: false,
    refLessonIds: [],
    note: "",
    eventKind: over.type === "custom" ? "study" : undefined,
    ...over,
    plannedDate: over.plannedDate || over.date || plannedDate,
  };
}

export function fillDay(over: Partial<StudyDayLog> & { date: string }): StudyDayLog {
  return {
    date: over.date,
    minutesStudied: Number(over.minutesStudied) || 0,
    tasksDone: Number(over.tasksDone) || 0,
    updatedAt: over.updatedAt || EPOCH_ISO,
  };
}

export function fillPlan(over: Partial<StudyPlan> & { id: string; examId: string }): StudyPlan {
  const prefs = fillPrefs(over.prefs);
  const courses = Array.isArray(over.courses)
    ? over.courses.map((c) => ({ ...c, lessons: asLessons(c.lessons) }))
    : [];
  const tasks = (over.tasks ?? []).map((t) => fillTask(t));
  return {
    id: over.id,
    examId: over.examId,
    examName: over.examName || over.name || over.examId,
    name: over.name || over.examName || "Plan",
    prefs,
    startDate: over.startDate || prefs.startDate || "",
    endDate: over.endDate || over.startDate || prefs.startDate || "",
    active: over.active ?? true,
    createdAt: over.createdAt || EPOCH_ISO,
    updatedAt: over.updatedAt || over.createdAt || EPOCH_ISO,
    deletedAt: over.deletedAt ?? null,
    courses,
    tasks,
    reviews: over.reviews ?? [],
    color: over.color ?? PLAN_COLORS[0],
    archived: over.archived ?? false,
  };
}
