import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { COPY, coursesCopy } from "@inkboard/shared/copy";
import { useSelectedExam, writeExamId } from "@inkboard/shared/exam-pref";
import { getExam } from "@inkboard/shared/exams";
import { makeIdFactory, uid } from "@inkboard/shared/planner/ids";
import { generatePlan } from "@inkboard/shared/planner/scheduler";
import { publishFormLedger } from "@inkboard/shared/planner/instruments";
import { nowIso, addDaysKey, todayKey } from "@inkboard/shared/planner/dates";
import {
  DEFAULT_PREFS,
  fillPrefs,
  PACE_LECTURES,
  type PaceId,
  type PlanCourseInput,
  type PlanLessonInput,
} from "@inkboard/shared/planner/types";
import { upsertPlan } from "@inkboard/shared/planner/storage";
import { prefsFromTemplate, templateById, type PlanTemplateId } from "@inkboard/shared/planner/templates";
import { suggestCourses } from "@inkboard/shared/planner/syllabus";
import { courseForSubject, orderedCourses, playlistBalance } from "@inkboard/shared/planner/wizard";
import {
  loadCourseDetail,
  loadEducatorPage,
  loadExamHub,
  loadExamTeachers,
  type ExamTeacher,
  type UaCourse,
} from "@/lib/unacademy";
import { WizardExam } from "./wizard-exam.tsx";
import { WizardCourses } from "./wizard-courses.tsx";
import { WizardPrefs } from "./wizard-prefs.tsx";
import { WizardPreview } from "./wizard-preview.tsx";

export type NewSearch = {
  exam?: string;
  teacher?: string;
  course?: string;
  days?: number;
  pace?: PaceId;
  template?: PlanTemplateId;
};

function lessonsFromDetail(detail: { lessons: { replayId?: string | null; uid: string; title: string; durationSec: number; rank: number; week?: number | null; notesUrl?: string | null; dppUrl?: string | null; playable: boolean; status: string }[] }, topic?: string): PlanLessonInput[] {
  return detail.lessons.map((l) => ({
    lessonId: l.replayId || l.uid,
    title: l.title,
    durationSec: l.durationSec,
    rank: l.rank,
    week: l.week ?? null,
    notesUrl: l.notesUrl ?? null,
    dppUrl: l.dppUrl ?? null,
    playable: l.playable,
    status: l.status,
    topic,
  }));
}

function examCourseToUa(c: {
  uid: string;
  name: string;
  slug?: string;
  thumbnail?: string;
  lessonCount: number;
  topic: string;
}): UaCourse {
  return {
    uid: c.uid,
    name: c.name,
    slug: c.slug ?? c.uid,
    thumbnail: c.thumbnail ?? "",
    itemCount: c.lessonCount,
    language: "",
    startsAt: null,
    endsAt: null,
    viewCount: 0,
    topics: c.topic ? [{ uid: c.topic, name: c.topic, level: 1 }] : [],
  };
}

export function PlannerNew() {
  const search = useSearch({ from: "/planner/new" });
  const nav = useNavigate();
  const sealed = useSelectedExam();
  const [step, setStep] = useState(() => (search.exam || sealed ? 1 : 0));
  const [examId, setExamId] = useState(search.exam ?? sealed?.id ?? "");
  const [picked, setPicked] = useState<Record<string, PlanCourseInput>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [openTeacher, setOpenTeacher] = useState(search.teacher ?? "");
  const [teacherQ, setTeacherQ] = useState("");
  const [teacherErr, setTeacherErr] = useState("");
  const [extraTeachers, setExtraTeachers] = useState<ExamTeacher[]>([]);
  const [moreOffset, setMoreOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [prefs, setPrefs] = useState(() => {
    const tpl = templateById(search.template);
    if (tpl) return prefsFromTemplate(tpl);
    const pace: PaceId = search.pace ?? "steady";
    return fillPrefs({
      ...DEFAULT_PREFS,
      startDate: todayKey(),
      examDate: search.days ? addDaysKey(todayKey(), search.days) : null,
      pace,
      lecturesPerDay: PACE_LECTURES[pace],
    });
  });
  const exam = getExam(examId);
  const prefilled = useRef(false);

  const teachersQ = useQuery({
    queryKey: ["planner-teachers", examId],
    enabled: Boolean(exam) && step >= 1,
    queryFn: ({ signal }) => loadExamTeachers({ data: { goalId: exam!.id, offset: 0 }, signal }),
  });
  const eduQ = useQuery({
    queryKey: ["planner-edu", openTeacher],
    enabled: Boolean(openTeacher),
    queryFn: ({ signal }) => loadEducatorPage({ data: { username: openTeacher, offset: 0, sort: "latest" }, signal }),
  });

  useEffect(() => {
    setExtraTeachers([]);
    setMoreOffset(teachersQ.data?.nextOffset ?? null);
  }, [examId, teachersQ.data?.nextOffset]);

  const selected = orderedCourses(picked, order);
  const selectedKey = selected.map((c) => c.courseId).join("|");
  const studyDaysKey = prefs.studyDays.join(",");
  const holidaysKey = prefs.holidays.join(",");
  const intervalsKey = prefs.revisionIntervals.join(",");
  const preview = useMemo(
    () => generatePlan(prefs, selected, { id: makeIdFactory("p") }),
    [
      prefs.startDate,
      prefs.examDate,
      prefs.speed,
      prefs.includeRevision,
      prefs.includeDpp,
      prefs.catchUpDay,
      prefs.pace,
      prefs.lecturesPerDay,
      prefs.maxNewMinutesPerDay,
      prefs.playlistMode,
      prefs.restEvery,
      prefs.revisionShare,
      intervalsKey,
      studyDaysKey,
      holidaysKey,
      selectedKey,
    ],
  );

  const hubQ = useQuery({
    queryKey: ["planner-hub", examId],
    enabled: Boolean(exam) && step === 1,
    queryFn: ({ signal }) => loadExamHub({ data: { goalId: exam!.id }, signal }),
  });
  const suggestions = hubQ.data ? suggestCourses(hubQ.data.courses) : [];
  const balance = playlistBalance(selected, prefs.speed);

  useEffect(() => {
    if (prefilled.current || !search.course || !openTeacher || !eduQ.data) return;
    const course = eduQ.data.courses.find((c) => c.uid === search.course);
    if (!course) return;
    prefilled.current = true;
    const teacherRow = teachersQ.data?.teachers.find((t) => t.username === openTeacher);
    void (async () => {
      const detail = await loadCourseDetail({
        data: { uid: course.uid, slug: course.slug, teacher: teacherRow?.username ?? openTeacher },
      });
      toggleCourse(
        openTeacher,
        course,
        lessonsFromDetail(detail, course.topics.length === 1 ? course.topics[0]?.name : undefined),
        teacherRow?.name ?? openTeacher,
      );
    })();
  }, [eduQ.data, search.course, openTeacher, teachersQ.data]);

  function toggleCourse(teacher: string, course: UaCourse, lessons: PlanCourseInput["lessons"], teacherName: string) {
    setPicked((cur) => {
      const next = { ...cur };
      if (next[course.uid]) delete next[course.uid];
      else {
        next[course.uid] = {
          courseId: course.uid,
          title: course.name,
          teacher: teacherName,
          teacherUsername: teacher,
          subject: course.topics[0]?.name,
          topics: (course.topics ?? []).map((t) => ({ uid: t.uid, name: t.name })),
          lessons,
        };
      }
      return next;
    });
    setOrder((cur) => (cur.includes(course.uid) ? cur.filter((id) => id !== course.uid) : [...cur, course.uid]));
  }

  async function pickCourse(teacher: { username: string; name: string }, course: UaCourse) {
    if (picked[course.uid]) {
      toggleCourse(teacher.username, course, [], teacher.name);
      return;
    }
    const detail = await loadCourseDetail({
      data: { uid: course.uid, slug: course.slug, teacher: teacher.username },
    });
    toggleCourse(
      teacher.username,
      course,
      lessonsFromDetail(detail, course.topics.length === 1 ? course.topics[0]?.name : undefined),
      teacher.name,
    );
  }

  async function applySuggestion(s: {
    subject: string;
    course: {
      uid: string;
      name: string;
      slug?: string;
      topic: string;
      lessonCount: number;
      authorName: string;
      authorUsername: string;
      thumbnail?: string;
    };
  }) {
    const existing = courseForSubject(selected, s.subject);
    if (existing && existing.courseId !== s.course.uid) {
      setPicked((cur) => {
        const next = { ...cur };
        delete next[existing.courseId];
        return next;
      });
      setOrder((cur) => cur.filter((id) => id !== existing.courseId));
    }
    await pickCourse(
      { username: s.course.authorUsername, name: s.course.authorName },
      examCourseToUa(s.course),
    );
    setOpenTeacher(s.course.authorUsername);
  }

  useEffect(() => {
    const ed = eduQ.data?.educator;
    if (!ed || !search.teacher) return;
    if (ed.username.toLowerCase() !== search.teacher.toLowerCase()) return;
    setExtraTeachers((cur) =>
      cur.some((t) => t.username === ed.username)
        ? cur
        : [
            {
              username: ed.username,
              uid: ed.uid,
              name: ed.name,
              bio: ed.bio,
              avatar: ed.avatar,
              followers: ed.followers,
              topics: (eduQ.data?.topics ?? []).map((t) => t.name).slice(0, 4).join(" · "),
              rank: null,
            },
            ...cur,
          ],
    );
  }, [eduQ.data, search.teacher]);

  async function addTeacherByUsername(raw: string) {
    const username = raw.replace(/^@+/, "").trim();
    if (!username) return;
    setTeacherErr("");
    try {
      const page = await loadEducatorPage({ data: { username, offset: 0, sort: "latest" } });
      const ed = page.educator;
      setExtraTeachers((cur) =>
        cur.some((t) => t.username === ed.username)
          ? cur
          : [
              {
                username: ed.username,
                uid: ed.uid,
                name: ed.name,
                bio: ed.bio,
                avatar: ed.avatar,
                followers: ed.followers,
                topics: page.topics.map((t) => t.name).slice(0, 4).join(" · "),
                rank: null,
              },
              ...cur,
            ],
      );
      setOpenTeacher(ed.username);
      setTeacherQ("");
    } catch (err) {
      setTeacherErr(err instanceof Error ? err.message : COPY.teacherNotOnWall);
    }
  }

  async function loadMoreTeachers() {
    if (moreOffset == null || loadingMore || !exam) return;
    setLoadingMore(true);
    try {
      const page = await loadExamTeachers({ data: { goalId: exam.id, offset: moreOffset } });
      setExtraTeachers((cur) => {
        const have = new Set([...(teachersQ.data?.teachers ?? []).map((t) => t.username), ...cur.map((t) => t.username)]);
        return [...cur, ...page.teachers.filter((t) => !have.has(t.username))];
      });
      setMoreOffset(page.nextOffset);
    } finally {
      setLoadingMore(false);
    }
  }

  function create() {
    if (!exam || !preview.tasks.length) return;
    upsertPlan(
      {
        id: uid("plan"),
        examId: exam.id,
        examName: exam.name,
        name: `${exam.name} · ${selected[0]?.teacher ?? "plan"}`,
        prefs: fillPrefs(prefs),
        startDate: preview.startDate,
        endDate: preview.endDate,
        active: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deletedAt: null,
        courses: selected,
        tasks: preview.tasks,
        reviews: preview.reviews,
      },
      true,
    );
    void nav({ to: "/planner", search: { day: undefined } });
  }

  const steps = ["Exam", "Courses", "Pace", "Preview"];
  const finish = preview.summary.finishDate;
  const perDay = prefs.lecturesPerDay;

  useEffect(() => {
    publishFormLedger({
      kicker: `${step + 1} of 4`,
      title: steps[step] ?? "Plan",
      lines: [
        exam ? exam.name : "Pick an exam",
        coursesCopy(selected.length) || "No courses",
        `${perDay} lectures/day`,
        finish ? `finishes ${finish}` : "No finish date",
      ],
      warn: preview.summary.fitsBeforeExam === false ? "Won’t finish before the exam at this pace." : null,
    });
    return () => publishFormLedger(null);
  }, [step, exam, selected.length, perDay, finish, preview.summary.fitsBeforeExam]);

  return (
    <div className="max-w-3xl py-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">New plan</p>
        <p className="wizard-frac text-xs text-fg-muted tabular-nums">
          Step {step + 1} of 4 · {steps[step]}
        </p>
      </div>
      <h1 className="mt-1 font-serif text-2xl text-fg sm:text-3xl">Lay out a plan</h1>
      {exam && step > 0 ? <p className="mt-1 text-sm text-fg-muted">For {exam.name}</p> : null}
      <ol aria-label="Steps" className="m-0 mt-5 grid list-none grid-cols-4 gap-2 p-0">
        {steps.map((label, i) => {
          const state = i < step ? "done" : i === step ? "current" : "todo";
          const canJump = i < step;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!canJump}
                aria-current={state === "current" ? "step" : undefined}
                onClick={() => canJump && setStep(i)}
                className={`flex w-full flex-col gap-1.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default ${canJump ? "hover:text-fg" : ""}`}
              >
                <span className={`h-1 w-full rounded-sm ${state === "todo" ? "bg-line" : "bg-accent"}`} aria-hidden="true" />
                <span className={`text-xs ${state === "current" ? "font-semibold text-fg" : state === "done" ? "text-fg" : "text-fg-muted"}`}>
                  <span className="tabular-nums">{i + 1}.</span> {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div key={step} className="eraser-wipe mt-6">
        {step === 0 ? (
          <WizardExam
            examId={examId}
            onPick={(id) => {
              writeExamId(id);
              setExamId(id);
              setStep(1);
            }}
          />
        ) : null}
        {step === 1 && exam ? (
          <WizardCourses
            teacherQ={teacherQ}
            teacherErr={teacherErr}
            onTeacherQ={setTeacherQ}
            onAddTeacher={() => void addTeacherByUsername(teacherQ).catch(() => undefined)}
            suggestions={suggestions}
            onSuggest={applySuggestion}
            selected={selected}
            onReorder={(next) => setOrder(next.map((c) => c.courseId))}
            onRemove={(id) => {
              setPicked((cur) => {
                const next = { ...cur };
                delete next[id];
                return next;
              });
              setOrder((cur) => cur.filter((x) => x !== id));
            }}
            balanceWarning={balance.warning}
            teachersLoading={teachersQ.isLoading}
            teachers={teachersQ.data?.teachers ?? []}
            extraTeachers={extraTeachers}
            openTeacher={openTeacher}
            onOpenTeacher={setOpenTeacher}
            eduLoading={eduQ.isLoading}
            courses={eduQ.data?.courses ?? []}
            picked={picked}
            speed={prefs.speed}
            onPickCourse={(t, c) => void pickCourse(t, c)}
            moreOffset={moreOffset}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMoreTeachers()}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        ) : null}
        {step === 2 ? (
          <WizardPrefs
            prefs={prefs}
            onChange={setPrefs}
            preview={preview}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            onDropPlaylist={(id) => {
              setPicked((cur) => {
                const next = { ...cur };
                delete next[id];
                return next;
              });
              setOrder((cur) => cur.filter((x) => x !== id));
            }}
          />
        ) : null}
        {step === 3 ? <WizardPreview preview={preview} prefs={prefs} onBack={() => setStep(2)} onCreate={create} /> : null}
      </div>
    </div>
  );
}
