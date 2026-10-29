import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { notesHref } from "@inkboard/shared/notes";
import { lectureChipLabel, lectureTitlesFor } from "@inkboard/shared/planner/revision-health";
import { revisionBookmarkLine } from "@inkboard/shared/planner/bookmarks";
import {
  carryForward,
  moveTask,
  patchTask,
  pinTask,
  rateRevision,
  setTaskStatus,
  undoLast,
} from "@inkboard/shared/planner/storage";
import type { PlanTask, ReviewRating, StudyPlan } from "@inkboard/shared/planner/types";
import { SubjectDot } from "@/components/ui/planner/kit.tsx";
import { StrikeTitle } from "@/components/folio/shelf.tsx";

const TYPE_LABEL: Record<PlanTask["type"], string> = {
  lesson: "Lecture",
  revision: "Revision",
  dpp: "DPP",
  custom: "Task",
};

const EVENT_LABEL: Record<NonNullable<PlanTask["eventKind"]>, string> = {
  study: "Study",
  mock: "Mock test",
  pyq: "PYQ",
  exam: "Exam",
  holiday: "Holiday",
  note: "Note",
};

export function TaskRow({
  plan,
  task,
  selected,
  onToggleSelect,
  clock,
  index,
  next,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  plan: StudyPlan;
  task: PlanTask;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  clock?: string;
  index?: number;
  next?: boolean;
  onMove?: (dir: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const done = task.status === "done";
  const skipped = task.status === "skipped";
  const [menu, setMenu] = useState(false);
  const [move, setMove] = useState(false);
  const [note, setNote] = useState(false);
  const [dur, setDur] = useState(false);
  const covers = task.type === "revision" ? lectureTitlesFor(plan, task.refLessonIds) : [];
  const stamps = task.type === "revision" ? revisionBookmarkLine(task.refLessonIds) : "";
  const kind = task.eventKind && task.eventKind !== "study" ? EVENT_LABEL[task.eventKind] : TYPE_LABEL[task.type];

  function withUndo(label: string, fn: () => void) {
    fn();
    setMenu(false);
    if (label === "done" || label === "reopen") return;
    toast.success(label, { action: { label: "Undo", onClick: () => undoLast() } });
  }

  return (
    <article
      className={`chalk-row${next ? " is-next" : ""}${done ? " is-struck" : ""}${skipped ? " is-off" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      {onToggleSelect ? (
        <button
          type="button"
          className={`ink-tick${selected ? " is-on" : ""}`}
          aria-pressed={Boolean(selected)}
          aria-label={`Select ${task.title} for bulk actions`}
          onClick={() => onToggleSelect(task.id)}
        />
      ) : null}
      {onMove ? (
        <div className="row-carets">
          <button type="button" className="row-caret" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move up">
            <span aria-hidden="true">↑</span>
          </button>
          <button type="button" className="row-caret" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move down">
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className={`chalk-line${skipped ? " is-off" : ""}`}
        onClick={() => withUndo(done ? "reopen" : "done", () => setTaskStatus(plan.id, task.id, done ? "pending" : "done"))}
        aria-pressed={done}
      >
        <span className="sr-only">{done ? "Mark pending: " : "Mark done: "}</span>
        {next ? <span className="chalk-caret" aria-hidden="true" /> : null}
        {index != null ? <span className="chalk-num tabular">{index}</span> : <span className="chalk-num" />}
        {clock ? <span className="chalk-clock tabular">{clock}</span> : null}
        <span className="min-w-0 flex-1 text-left">
          <StrikeTitle done={done} className="min-w-0 truncate">
            {task.title}
          </StrikeTitle>
          <span className="chalk-meta">
            <SubjectDot subject={task.subject || task.teacher} /> {kind}
            {task.pinned ? " · pinned" : ""}
            {task.teacher ? ` · ${task.teacher}` : ""}
            {skipped ? " · skipped" : ""}
            {task.note ? ` · ${task.note}` : ""}
          </span>
          {covers.length ? (
            <span className="mt-1 block truncate text-xs text-fg-faint">{covers.map((c) => lectureChipLabel(c)).join(" · ")}</span>
          ) : null}
          {stamps ? <span className="mt-0.5 block truncate text-xs text-fg-muted">{stamps}</span> : null}
        </span>
        <span className="chalk-mins tabular">{task.durationMin}m</span>
      </button>
      <div className="chalk-actions relative">
        {task.lessonId && !done ? (
          <Link
            to="/play/$lessonId"
            params={{ lessonId: task.lessonId }}
            search={{ title: task.title, teacher: task.teacher, course: task.courseId ?? undefined }}
            className="ink-underline h-11 px-2 text-xs text-fg-muted"
          >
            Open
          </Link>
        ) : null}
        <button
          type="button"
          className="grid size-11 place-items-center text-fg-muted"
          aria-label="More actions"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          ···
        </button>
        {menu ? (
          <div className="absolute top-11 right-0 z-20 w-44 border border-line bg-surface p-1 text-xs">
            {task.status === "pending" ? (
              <button type="button" className="block h-11 w-full px-2 text-left hover:text-accent" onClick={() => withUndo("Skipped", () => setTaskStatus(plan.id, task.id, "skipped"))}>
                Skip
              </button>
            ) : null}
            {task.status === "pending" ? (
              <button type="button" className="block h-11 w-full px-2 text-left hover:text-accent" onClick={() => withUndo("Carried forward", () => carryForward(plan.id, task.id))}>
                Carry forward
              </button>
            ) : null}
            <button type="button" className="block h-11 w-full px-2 text-left hover:text-accent" onClick={() => setMove(true)}>
              Move to…
            </button>
            <button type="button" className="block h-11 w-full px-2 text-left hover:text-accent" onClick={() => withUndo(task.pinned ? "Unpinned" : "Pinned", () => pinTask(plan.id, task.id, !task.pinned))}>
              {task.pinned ? "Unpin" : "Pin to this day"}
            </button>
            <button
              type="button"
              className="block h-11 w-full px-2 text-left hover:text-accent"
              onClick={() => {
                setDur(true);
                setMenu(false);
              }}
            >
              Edit duration
            </button>
            <button
              type="button"
              className="block h-11 w-full px-2 text-left hover:text-accent"
              onClick={() => {
                setNote(true);
                setMenu(false);
              }}
            >
              Add note
            </button>
            {task.notesUrl ? (
              <a href={notesHref({ url: task.notesUrl })} className="block h-11 px-2 leading-[2.75rem] hover:text-accent" target="_blank" rel="noreferrer">
                Notes PDF
              </a>
            ) : null}
            {task.dppUrl ? (
              <a href={notesHref({ url: task.dppUrl })} className="block h-11 px-2 leading-[2.75rem] hover:text-accent" target="_blank" rel="noreferrer">
                DPP
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      {task.type === "revision" && (done || task.status === "pending") ? (
        <div className="flex w-full flex-wrap gap-x-4 px-2 pb-2">
          {(["shaky", "ok", "solid"] as ReviewRating[]).map((r) => (
            <button
              key={r}
              type="button"
              className={`h-11 text-xs capitalize ${task.note === r ? "text-accent" : "text-fg-muted"}`}
              onClick={() => rateRevision(plan.id, task.id, r)}
            >
              {r}
            </button>
          ))}
        </div>
      ) : null}
      {move ? (
        <label className="w-full px-2 pb-3 text-xs text-fg-muted">
          Move to
          <input
            type="date"
            className="mt-1 h-11 w-full border-0 border-b border-line bg-transparent px-0 text-sm text-fg"
            defaultValue={task.date}
            onChange={(e) => {
              if (!e.target.value) return;
              withUndo("Moved", () => moveTask(plan.id, task.id, e.target.value));
              setMove(false);
            }}
          />
        </label>
      ) : null}
      {note ? (
        <label className="w-full px-2 pb-3 text-xs text-fg-muted">
          Note
          <input
            className="mt-1 h-11 w-full border-0 border-b border-line bg-transparent px-0 text-sm text-fg"
            defaultValue={task.note ?? ""}
            onBlur={(e) => {
              patchTask(plan.id, task.id, { note: e.target.value });
              setNote(false);
            }}
          />
        </label>
      ) : null}
      {dur ? (
        <label className="w-full px-2 pb-3 text-xs text-fg-muted">
          Minutes
          <input
            type="number"
            min={5}
            max={480}
            className="mt-1 h-11 w-full border-0 border-b border-line bg-transparent px-0 text-sm text-fg"
            defaultValue={task.durationMin}
            onBlur={(e) => {
              patchTask(plan.id, task.id, { durationMin: Number(e.target.value) || task.durationMin });
              setDur(false);
            }}
          />
        </label>
      ) : null}
    </article>
  );
}
