import { Link, } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";


import { NotesButton } from "@/components/notes-button";



import { getCourse, getTeacher, lessonsForCourse } from "@inkboard/shared/catalog";




import { notesHref } from "@inkboard/shared/notes";



import {
  coverageRatio,
  lineState,
  nextOpenIndex,
  parseClock,
} from "@inkboard/shared/shelf";


import { SaveChapterButton, SaveClassButton, SaveCourseButton } from "@/components/save-chapter";
import { FavouriteCourseButton } from "@/components/favourite-course";
import { ChalkLead, ChalkRow, useShelfLedger, } from "@/components/folio/shelf";

import { peekProgress } from "@inkboard/shared/watch-history";

import { readWatchLogs } from "@inkboard/shared/planner/watch-store";


export function CatalogShelf({ courseId }: { courseId: string }) {
  const catalogCourse = getCourse(courseId)!;
  const catalogTeacher = getTeacher(catalogCourse.teacherSlug)!;
  const catalogLessons = lessonsForCourse(courseId);
  const logs = typeof window === "undefined" ? [] : readWatchLogs();
  const states = catalogLessons.map((lesson) => {
    const dur = parseClock(lesson.duration);
    return lineState({
      watchedSec: lesson.lessonId ? peekProgress(lesson.lessonId) : 0,
      durationSec: dur,
      coverage: lesson.lessonId ? coverageRatio(logs, lesson.lessonId, dur) : 0,
    });
  });
  const nextIdx = nextOpenIndex(states);
  useShelfLedger({
    kicker: "Course",
    title: catalogCourse.title,
    meta: `${catalogCourse.lessons} classes · ${catalogCourse.hours}`,
    teacher: catalogTeacher.slug,
    course: catalogCourse.id,
    next: nextIdx >= 0 ? catalogLessons[nextIdx]?.title : undefined,
  });

  return (
    <AppShell>
      <div className="board-pad">
        <Link to="/teacher/$slug" params={{ slug: catalogTeacher.slug }} className="ink-underline text-sm text-fg-muted">
          ← {catalogTeacher.name}
        </Link>
        <p className="mt-4 text-sm text-fg-muted">{catalogCourse.subject}</p>
        <h1 className="mt-1 text-2xl font-medium">{catalogCourse.title}</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {catalogTeacher.name} · {catalogCourse.lessons} classes · {catalogCourse.hours}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4">
          <FavouriteCourseButton
            courseId={catalogCourse.id}
            title={catalogCourse.title}
            teacher={catalogTeacher.slug}
            teacherName={catalogTeacher.name}
          />
          <SaveCourseButton
            courseId={catalogCourse.id}
            courseTitle={catalogCourse.title}
            groups={[{ week: null, lessons: catalogLessons.map((lesson) => ({
              replayId: lesson.lessonId,
              title: lesson.title,
              durationSec: parseClock(lesson.duration),
              playable: Boolean(lesson.lessonId) && !lesson.live,
              status: lesson.live ? "live" : lesson.lessonId ? "replay" : "upcoming",
            })) }]}
          />
          <SaveChapterButton
            courseId={catalogCourse.id}
            courseTitle={catalogCourse.title}
            chapterId={`${catalogCourse.id}-all`}
            chapterTitle={catalogCourse.title}
            lessons={catalogLessons.map((lesson) => ({
              replayId: lesson.lessonId,
              title: lesson.title,
              durationSec: parseClock(lesson.duration),
              playable: Boolean(lesson.lessonId) && !lesson.live,
              status: lesson.live ? "live" : lesson.lessonId ? "replay" : "upcoming",
            }))}
          />
        </div>
        <ol className="mt-8">
          {catalogLessons.map((lesson, i) => {
            const struck = states[i] === "struck";
            const next = i === nextIdx;
            const watchedSec = lesson.lessonId ? peekProgress(lesson.lessonId) : 0;
            const dur = parseClock(lesson.duration);
            const progress = dur > 0 ? (watchedSec / dur) * 100 : 0;
            return (
              <ChalkRow key={lesson.id} struck={struck} next={next} actions={
                <>
                  {lesson.lessonId ? <SaveClassButton lessonId={lesson.lessonId} title={lesson.title} variant="line" /> : null}
                  {lesson.lessonId ? <NotesButton href={notesHref({ id: lesson.lessonId, title: lesson.title })} /> : null}
                </>
              }>
                <Link
                  to="/play/$lessonId"
                  params={{ lessonId: lesson.lessonId ?? "unknown" }}
                  search={{ title: lesson.title, teacher: catalogTeacher.slug, course: catalogCourse.id }}
                  className="chalk-line"
                >
                  <ChalkLead
                    n={i + 1}
                    title={lesson.title}
                    meta={[lesson.duration, lesson.lessonId ? "Notes" : ""].filter(Boolean).join(" · ")}
                    struck={struck}
                    next={next}
                    progress={progress}
                  />
                </Link>
              </ChalkRow>
            );
          })}
        </ol>
      </div>
    </AppShell>
  );
}
