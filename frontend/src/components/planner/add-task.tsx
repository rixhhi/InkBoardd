import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui";
import { addCustomTask, addVacation, undoLast } from "@inkboard/shared/planner/storage";
import type { EventKind, StudyPlan } from "@inkboard/shared/planner/types";

const KINDS: { id: EventKind; label: string; minutes: number }[] = [
  { id: "study", label: "Custom study", minutes: 40 },
  { id: "mock", label: "Mock test", minutes: 180 },
  { id: "pyq", label: "PYQ practice", minutes: 60 },
  { id: "exam", label: "Exam date", minutes: 0 },
  { id: "holiday", label: "Holiday range", minutes: 0 },
];

/** Inline "write a task" form that lives under the day board. Pick a kind, name it, place it. */
export function AddTaskForm({
  plan,
  date,
  onDone,
}: {
  plan: StudyPlan;
  date: string;
  onDone?: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const kindName = useId();
  const [kind, setKind] = useState<EventKind>("study");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(date);
  const [until, setUntil] = useState(date);
  const [minutes, setMinutes] = useState(40);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    setWhen(date);
    setUntil(date);
  }, [date]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "holiday") {
      addVacation(plan.id, when, until);
      toast.success("Holiday marked", { action: { label: "Undo", onClick: () => undoLast() } });
      onDone?.();
      return;
    }
    const label = title.trim() || KINDS.find((k) => k.id === kind)?.label || "Task";
    addCustomTask(plan.id, {
      title: label,
      date: when,
      durationMin: kind === "exam" ? 0 : minutes,
      type: "custom",
      eventKind: kind,
    });
    toast.success("Added", { action: { label: "Undo", onClick: () => undoLast() } });
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm" aria-label="Write a task">
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Kind</legend>
        {KINDS.map((k) => {
          const on = kind === k.id;
          return (
            <label
              key={k.id}
              className={`inline-flex h-8 cursor-pointer items-center rounded-full px-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
                on ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"
              }`}
            >
              <input
                type="radio"
                name={kindName}
                value={k.id}
                checked={on}
                className="sr-only"
                onChange={() => {
                  setKind(k.id);
                  setMinutes(k.minutes || 40);
                }}
              />
              {k.label}
            </label>
          );
        })}
      </fieldset>
      {kind !== "holiday" ? (
        <Input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Write a task" aria-label="Task title" />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-fg-muted">{kind === "holiday" ? "From" : "Date"}</span>
          <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        {kind === "holiday" ? (
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-fg-muted">Until</span>
            <Input type="date" value={until} min={when} onChange={(e) => setUntil(e.target.value)} />
          </label>
        ) : kind !== "exam" ? (
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-fg-muted">Minutes</span>
            <Input type="number" min={5} max={480} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 40)} />
          </label>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Add
        </Button>
        {onDone ? (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
