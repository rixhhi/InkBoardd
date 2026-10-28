import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { lectureScore, readChecks, setChecks, subscribeFavourites, type LectureChecks } from "@inkboard/shared/favourites";

const ITEMS: { key: keyof LectureChecks; label: string; hint: string }[] = [
  { key: "notes", label: "Notes", hint: "You made notes for this class" },
  { key: "questions", label: "Questions", hint: "You solved a few questions" },
  { key: "teacherQuestions", label: "Teacher’s questions", hint: "You solved the questions from class" },
  { key: "revision", label: "Revision", hint: "You revised this class" },
];

export function donePercent(checks: LectureChecks) {
  return Math.round(lectureScore(checks) * 100);
}

export function doneLabel(checks: LectureChecks) {
  const score = donePercent(checks);
  if (score >= 100) return "Done";
  if (score > 0) return `${score}% done`;
  return "Mark as done";
}

export function MarkDoneButton({ lessonId, title, quiet }: { lessonId: string; title: string; quiet?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeFavourites(() => setTick((n) => n + 1)), []);
  void tick;
  if (!lessonId) return null;
  const checks = readChecks(lessonId);
  return (
    <>
      <button
        type="button"
        className={quiet ? "text-xs text-fg-muted hover:text-fg" : "text-xs text-accent"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {doneLabel(checks)}
      </button>
      {open ? <MarkDoneDialog lessonId={lessonId} title={title} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MarkDoneDialog({ lessonId, title, onClose }: { lessonId: string; title: string; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeFavourites(() => setTick((n) => n + 1)), []);
  void tick;
  const checks = readChecks(lessonId);
  const score = donePercent(checks);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="ui-dialog-backdrop" style={{ zIndex: 80 }} onClick={onClose}>
      <div
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-done-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="mark-done-title" className="font-serif text-xl">
          {title}
        </p>
        <p className="mt-2 text-xs text-fg-muted">Tick what you finished. Each one is a quarter of this class.</p>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {ITEMS.map((item) => {
            const on = checks[item.key];
            return (
              <li key={item.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  className="flex w-full items-baseline justify-between gap-3 py-3 text-left"
                  onClick={() => setChecks(lessonId, { [item.key]: !on })}
                >
                  <span>
                    <span className="block text-sm">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-fg-muted">{item.hint}</span>
                  </span>
                  <span className={`text-sm ${on ? "text-accent" : "text-fg-faint"}`}>{on ? "Done" : "Not yet"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <p className="text-sm">{score}% done</p>
          <button type="button" className="text-sm text-accent" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
