import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Zap } from "lucide-react";
import { Avatar, Badge, Card, Dot, List, ListRow, Thumb } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtWhen } from "@inkboard/shared/exam-wall";
import { subjectIdOf, subjectVar } from "@inkboard/shared/planner/subjects";
import { courseQueryOptions, loadEducatorPage, type CrashDoor as CrashDoorRow, type ExamCourse, type ExamPlaylist, type ExamTeacher, type LiveSlot } from "@/lib/unacademy";
import { schedulePrefetch } from "@/lib/prefetch";
import { COPY } from "@inkboard/shared/copy";

/**
 * Exam-hub building blocks on the kit. Exports keep their old names because
 * exam-hub.tsx and search-page.tsx import them; the markup underneath is new.
 */

/** Subject colour swatch. Colour is decorative; the subject name is always printed next to it. */
function SubjectDot({ label, className }: { label: string | undefined | null; className?: string }) {
  return <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", className)} style={{ background: subjectVar(subjectIdOf(label)) }} />;
}

/* ---------------- live / crash "doors" ---------------- */

export function LiveDoor({ slot, withDay }: { slot: LiveSlot; withDay?: boolean }) {
  const live = slot.status === "live";
  const nav = useNavigate();
  const open = slot.replayId
    ? () => void nav({ to: "/play/$lessonId", params: { lessonId: slot.replayId! }, search: { title: slot.title, teacher: slot.authorUsername } })
    : undefined;
  return (
    <ListRow
      density="compact"
      leading={<Avatar src={slot.authorAvatar} name={slot.authorName || slot.authorUsername} size="sm" decorative />}
      title={
        slot.replayId ? (
          <Link to="/play/$lessonId" params={{ lessonId: slot.replayId }} search={{ title: slot.title, teacher: slot.authorUsername }} className="hover:underline focus-visible:outline-none">
            {slot.title}
          </Link>
        ) : (
          <span>{slot.title}</span>
        )
      }
      badge={live ? <Badge tone="live">Live</Badge> : slot.liveAt ? <Badge tone="info">{fmtWhen(slot.liveAt, withDay)}</Badge> : undefined}
      meta={<span>{slot.authorName || slot.authorUsername}</span>}
      onActivate={open}
    />
  );
}

export function CrashDoor({ door }: { door: CrashDoorRow }) {
  const nav = useNavigate();
  const isBatch = door.kind === "batch";
  const open = () =>
    isBatch
      ? void nav({ to: "/batch/$batchId", params: { batchId: door.uid }, search: { slug: door.slug } })
      : void nav({ to: "/course/$courseId", params: { courseId: door.uid }, search: { slug: door.slug || undefined } });
  return (
    <ListRow
      density="compact"
      leading={
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-warn-subtle">
          <Zap aria-hidden="true" className="size-4 text-warn" />
        </span>
      }
      title={
        isBatch ? (
          <Link to="/batch/$batchId" params={{ batchId: door.uid }} search={{ slug: door.slug }} className="hover:underline focus-visible:outline-none">
            {door.name}
          </Link>
        ) : (
          <Link to="/course/$courseId" params={{ courseId: door.uid }} search={{ slug: door.slug || undefined }} className="hover:underline focus-visible:outline-none">
            {door.name}
          </Link>
        )
      }
      badge={<Badge tone="warn">{COPY.crash}</Badge>}
      meta={
        <>
          <span>{isBatch ? "Batch" : "Course"}</span>
          {door.authorName ? (
            <>
              <Dot />
              <span>{door.authorName}</span>
            </>
          ) : null}
        </>
      }
      onActivate={open}
    />
  );
}

/* ---------------- subject plates ---------------- */

export function SubjectPlate({ name, caption, selected, onSelect }: { name: string; caption: string; selected?: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-[4.5rem] items-start gap-3 rounded-lg bg-surface p-4 text-left shadow-1 transition-[box-shadow,background-color] duration-[var(--dur-fast)]",
        "hover:shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected && "bg-accent-subtle shadow-[0_0_0_2px_var(--color-accent)]",
      )}
    >
      <SubjectDot label={name} className="mt-1.5 size-3" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg">{name}</span>
        <span className="mt-0.5 block text-xs text-fg-muted">{caption}</span>
      </span>
    </button>
  );
}

/* ---------------- course / playlist rows ---------------- */

export function CourseIndex({ c, inPlan }: { c: ExamCourse; inPlan?: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const live = c.status === "live";
  const single = Boolean(c.replayId) && c.lessonCount <= 1;
  const prefetch = () => schedulePrefetch(() => qc.prefetchQuery(courseQueryOptions(c.uid, c.slug, c.authorUsername)));
  const open = () =>
    single
      ? void nav({ to: "/play/$lessonId", params: { lessonId: c.replayId! }, search: { title: c.name, teacher: c.authorUsername, course: c.uid } })
      : void nav({ to: "/course/$courseId", params: { courseId: c.uid }, search: { slug: c.slug || undefined, teacher: c.authorUsername } });
  return (
    <ListRow
      leading={<Thumb src={c.thumbnail} />}
      title={
        single ? (
          <Link to="/play/$lessonId" params={{ lessonId: c.replayId! }} search={{ title: c.name, teacher: c.authorUsername, course: c.uid }} className="hover:underline focus-visible:outline-none">
            {c.name}
          </Link>
        ) : (
          <Link to="/course/$courseId" params={{ courseId: c.uid }} search={{ slug: c.slug || undefined, teacher: c.authorUsername }} onMouseEnter={prefetch} onFocus={prefetch} className="hover:underline focus-visible:outline-none">
            {c.name}
          </Link>
        )
      }
      badge={live ? <Badge tone="live">Live</Badge> : inPlan ? <Badge tone="accent">In plan</Badge> : undefined}
      meta={
        <>
          {c.topic ? (
            <span className="inline-flex items-center gap-1.5">
              <SubjectDot label={c.topic} className="size-2" />
              {c.topic}
            </span>
          ) : null}
          {c.authorName || c.authorUsername ? (
            <>
              {c.topic ? <Dot /> : null}
              <span>{c.authorName || c.authorUsername}</span>
            </>
          ) : null}
          {c.lessonCount ? (
            <>
              <Dot />
              <span>{c.lessonCount === 1 ? "1 class" : `${c.lessonCount} classes`}</span>
            </>
          ) : null}
          {c.liveAt && !live ? (
            <>
              <Dot />
              <span>{fmtWhen(c.liveAt, true)}</span>
            </>
          ) : null}
        </>
      }
      onActivate={open}
    />
  );
}

export function PlaylistIndex({ p }: { p: ExamPlaylist }) {
  const nav = useNavigate();
  const realCourse = Boolean(p.courseUid && p.courseSlug?.includes("-") && p.courseUid !== p.uid);
  const title = realCourse && p.courseUid ? (
    <Link to="/course/$courseId" params={{ courseId: p.courseUid }} search={{ slug: p.courseSlug || undefined, teacher: p.authorUsername }} className="hover:underline focus-visible:outline-none">
      {p.name}
    </Link>
  ) : p.authorUsername ? (
    <Link to="/teacher/$slug" params={{ slug: p.authorUsername }} className="hover:underline focus-visible:outline-none">
      {p.name}
    </Link>
  ) : (
    <span>{p.name}</span>
  );
  const open = realCourse && p.courseUid
    ? () => void nav({ to: "/course/$courseId", params: { courseId: p.courseUid! }, search: { slug: p.courseSlug || undefined, teacher: p.authorUsername } })
    : p.authorUsername
      ? () => void nav({ to: "/teacher/$slug", params: { slug: p.authorUsername } })
      : undefined;
  return (
    <ListRow
      leading={<Thumb src={p.thumbnail} />}
      title={title}
      meta={
        <>
          {p.topic ? (
            <span className="inline-flex items-center gap-1.5">
              <SubjectDot label={p.topic} className="size-2" />
              {p.topic}
            </span>
          ) : null}
          {p.authorName || p.authorUsername ? (
            <>
              {p.topic ? <Dot /> : null}
              <span>{p.authorName || p.authorUsername}</span>
            </>
          ) : null}
          {p.lessonCount ? (
            <>
              <Dot />
              <span>{p.lessonCount} classes</span>
            </>
          ) : null}
        </>
      }
      onActivate={open}
    />
  );
}

/* ---------------- teachers ---------------- */

export function TeacherStamp({ t }: { t: ExamTeacher }) {
  const qc = useQueryClient();
  const prefetch = () =>
    schedulePrefetch(() =>
      qc.prefetchQuery({
        queryKey: ["educator", t.username.toLowerCase(), "latest"],
        queryFn: ({ signal }) => loadEducatorPage({ data: { username: t.username, sort: "latest", offset: 0 }, signal }),
      }),
    );
  return (
    <Link
      to="/teacher/$slug"
      params={{ slug: t.username }}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      className="group/teacher flex flex-col items-center gap-2 rounded-lg p-3 text-center transition-colors duration-[var(--dur-fast)] hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Avatar src={t.avatar} name={t.name} size="xl" decorative className="transition-transform duration-[var(--dur-fast)] group-hover/teacher:scale-105" />
      <span className="line-clamp-2 text-sm font-medium text-fg">{t.name}</span>
    </Link>
  );
}

/* ---------------- containers ---------------- */

export function DoorRow({ children }: { children: ReactNode }) {
  return (
    <Card padded={false} interactive={false} className="overflow-hidden">
      <List className="gap-0 divide-y divide-line p-1" label="Live and crash courses">
        {children}
      </List>
    </Card>
  );
}

export function PlateGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

export function StampRack({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">{children}</div>;
}

export function IndexShelf({ children, label }: { children: ReactNode; label?: string }) {
  return <List label={label}>{children}</List>;
}
