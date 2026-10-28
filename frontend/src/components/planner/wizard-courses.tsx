import { useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Plus, Sparkles, UserPlus, X } from "lucide-react";
import { Avatar, Badge, Button, EmptyState, IconButton, Input, Section, Surface } from "@/components/ui";
import { Fetching } from "@/components/fetching";
import { hoursForCourse } from "@inkboard/shared/planner/syllabus";
import { chipMeta, courseForSubject, estimateHours, moveIndex, selectedTotals } from "@inkboard/shared/planner/wizard";
import type { PlanCourseInput } from "@inkboard/shared/planner/types";
import type { ExamTeacher, UaCourse } from "@/lib/unacademy";
import { cn } from "@/lib/cn";

export type CourseSuggestion = {
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
};

/**
 * Step 2: choose courses. Three ways in: one suggested course per subject,
 * a teacher's courses for this exam, or a pasted teacher username.
 * The picked list is ordered — the first course is scheduled first.
 */
export function WizardCourses({
  teacherQ,
  teacherErr,
  onTeacherQ,
  onAddTeacher,
  suggestions,
  onSuggest,
  selected,
  onReorder,
  onRemove,
  balanceWarning,
  teachersLoading,
  teachers,
  extraTeachers,
  openTeacher,
  onOpenTeacher,
  eduLoading,
  courses,
  picked,
  speed,
  onPickCourse,
  moreOffset,
  loadingMore,
  onLoadMore,
  onBack,
  onNext,
}: {
  teacherQ: string;
  teacherErr: string;
  onTeacherQ: (v: string) => void;
  onAddTeacher: () => void;
  suggestions: CourseSuggestion[];
  onSuggest: (s: CourseSuggestion) => Promise<void> | void;
  selected: PlanCourseInput[];
  onReorder: (next: PlanCourseInput[]) => void;
  onRemove: (id: string) => void;
  balanceWarning: string | null;
  teachersLoading: boolean;
  teachers: ExamTeacher[];
  extraTeachers: ExamTeacher[];
  openTeacher: string;
  onOpenTeacher: (username: string) => void;
  eduLoading: boolean;
  courses: UaCourse[];
  picked: Record<string, PlanCourseInput>;
  speed: number;
  onPickCourse: (teacher: ExamTeacher, course: UaCourse) => void;
  moreOffset: number | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const list = [...extraTeachers, ...teachers].filter((t, i, all) => all.findIndex((x) => x.username === t.username) === i);
  const totals = selectedTotals(selected, speed);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  function onDropChip(fromId: string, toId: string) {
    const from = selected.findIndex((c) => c.courseId === fromId);
    const to = selected.findIndex((c) => c.courseId === toId);
    if (from < 0 || to < 0) return;
    onReorder(moveIndex(selected, from, to));
  }

  async function applySuggest(s: CourseSuggestion) {
    setBusyId(s.course.uid);
    try {
      await onSuggest(s);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Picked courses, in schedule order. */}
      <Surface className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-fg">Your courses</h2>
          {selected.length ? (
            <p className="text-sm text-fg-muted tabular-nums">
              {totals.courses} course{totals.courses === 1 ? "" : "s"} · {totals.playable} classes · {totals.hours}h
            </p>
          ) : null}
        </div>
        {selected.length ? (
          <>
            <p className="-mt-1 text-xs text-fg-muted">The first course is scheduled first. Drag, or use the arrows, to reorder.</p>
            <ol className="m-0 grid list-none gap-1.5 p-0" aria-label="Picked courses in schedule order">
              {selected.map((c, i) => {
                const meta = chipMeta(c, speed);
                return (
                  <li
                    key={c.courseId}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.courseId);
                      setDragging(c.courseId);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDropChip(e.dataTransfer.getData("text/plain"), c.courseId);
                      setDragging(null);
                    }}
                    className={cn("flex items-center gap-2 rounded-md bg-surface-raised/60 py-1.5 pr-1 pl-2", dragging === c.courseId && "opacity-50")}
                  >
                    <GripVertical aria-hidden="true" className="hidden size-4 shrink-0 cursor-grab text-fg-faint sm:block" />
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold text-fg tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{c.title}</span>
                      <span className="block truncate text-xs text-fg-muted">{meta.label}</span>
                    </span>
                    <span className="flex shrink-0 items-center">
                      <IconButton label={`Move ${c.title} earlier`} icon={ArrowUp} size="sm" disabled={i === 0} onClick={() => onReorder(moveIndex(selected, i, i - 1))} />
                      <IconButton label={`Move ${c.title} later`} icon={ArrowDown} size="sm" disabled={i === selected.length - 1} onClick={() => onReorder(moveIndex(selected, i, i + 1))} />
                      <IconButton label={`Remove ${c.title}`} icon={X} size="sm" onClick={() => onRemove(c.courseId)} />
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className="text-sm text-fg-muted">Nothing picked yet. Add a suggested course below, or open a teacher.</p>
        )}
        {balanceWarning ? (
          <p role="status" className="rounded-md bg-warn-subtle px-3 py-2 text-sm text-fg">
            {balanceWarning}
          </p>
        ) : null}
      </Surface>

      {suggestions.length ? (
        <Section title="Suggested for you" description="One popular course per subject for this exam.">
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {suggestions.slice(0, 8).map((s) => {
              const hours = estimateHours(s.course.lessonCount, speed);
              const current = courseForSubject(selected, s.subject);
              const on = current?.courseId === s.course.uid;
              const swap = Boolean(current && !on);
              return (
                <li key={s.course.uid}>
                  <div className={cn("flex h-full items-start gap-3 rounded-lg p-3 shadow-1", on ? "bg-accent-subtle ring-1 ring-accent" : "bg-surface")}>
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-raised text-accent">
                      <Sparkles className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Badge>{s.subject}</Badge>
                      <span className="mt-1 block text-sm font-medium text-fg [overflow-wrap:anywhere]">{s.course.name}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {s.course.lessonCount} classes · ~{hours}h · {s.course.authorName}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant={on ? "ghost" : "secondary"}
                      icon={on ? Check : Plus}
                      disabled={on}
                      loading={busyId === s.course.uid}
                      onClick={() => void applySuggest(s)}
                      aria-label={on ? `${s.course.name} added` : swap ? `Swap ${s.subject} course for ${s.course.name}` : `Add ${s.course.name}`}
                    >
                      {on ? "Added" : swap ? "Swap" : "Add"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section title="Pick from a teacher" description="Open a teacher to see their courses for this exam, then tick the ones you want.">
        {teachersLoading ? (
          <Fetching label="Fetching teachers" compact />
        ) : list.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {list.map((t) => {
              const open = openTeacher === t.username;
              const count = Object.values(picked).filter((c) => c.teacherUsername === t.username).length;
              return (
                <li key={t.username} className="overflow-hidden rounded-lg bg-surface shadow-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => onOpenTeacher(open ? "" : t.username)}
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                  >
                    <Avatar src={t.avatar} name={t.name} size="md" decorative />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-fg">{t.name}</span>
                      <span className="block truncate text-xs text-fg-muted">@{t.username}</span>
                    </span>
                    {count ? <Badge tone="accent">{count} picked</Badge> : null}
                    <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-fg-muted transition-transform", open && "rotate-180")} />
                  </button>
                  {open ? (
                    <div className="border-t border-line px-3 py-2">
                      {eduLoading ? (
                        <div className="py-2">
                          <Fetching label="Fetching courses" compact />
                        </div>
                      ) : courses.length ? (
                        <ul className="m-0 grid list-none gap-0.5 p-0">
                          {courses.map((c) => {
                            const on = Boolean(picked[c.uid]);
                            const stats = on ? hoursForCourse(picked[c.uid]!, speed) : null;
                            return (
                              <li key={c.uid}>
                                <label className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-2 py-2", on ? "bg-accent-subtle" : "hover:bg-surface-raised/60")}>
                                  <input type="checkbox" className="size-4 shrink-0 accent-[var(--color-accent)]" checked={on} onChange={() => onPickCourse(t, c)} aria-label={c.name} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm text-fg [overflow-wrap:anywhere]">{c.name}</span>
                                    <span className="block text-xs text-fg-muted">
                                      {stats ? `${stats.playable} playable · ${stats.hours}h${stats.skipped ? ` · ${stats.skipped} not available` : ""}` : `${c.itemCount} classes`}
                                    </span>
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="py-2 text-sm text-fg-muted">No courses from this teacher for this exam.</p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No teachers listed" body="Pick another exam, or add a teacher by username below." />
        )}
        {moreOffset != null ? (
          <div className="mt-3">
            <Button variant="secondary" loading={loadingMore} onClick={onLoadMore}>
              Show more teachers
            </Button>
          </div>
        ) : null}
      </Section>

      <Section title="Add a teacher by username" level={3}>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onAddTeacher();
          }}
        >
          <Input
            value={teacherQ}
            onChange={(e) => onTeacherQ(e.target.value)}
            placeholder="e.g. @seep.pahuja or a teacher link"
            aria-label="Teacher username or link"
            aria-invalid={teacherErr ? true : undefined}
            className="min-w-0 flex-1 basis-56"
            spellCheck={false}
            autoCapitalize="none"
          />
          <Button type="submit" variant="secondary" icon={UserPlus} disabled={!teacherQ.trim()}>
            Add teacher
          </Button>
        </form>
        {teacherErr ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {teacherErr}
          </p>
        ) : null}
      </Section>

      <div className="sticky bottom-[calc(var(--tabbar-h,0px)+0.5rem)] z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface/95 p-3 shadow-2 backdrop-blur md:bottom-3">
        <Button type="button" variant="ghost" icon={ChevronLeft} onClick={onBack}>
          Exam
        </Button>
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-fg-muted sm:block" aria-live="polite">
            {selected.length ? `${selected.length} course${selected.length === 1 ? "" : "s"} picked` : "Add at least one course"}
          </p>
          <Button type="button" disabled={!selected.length} iconEnd={ChevronRight} onClick={onNext}>
            Pace
          </Button>
        </div>
      </div>
    </div>
  );
}
