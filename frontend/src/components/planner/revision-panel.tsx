import { Link } from "@tanstack/react-router";
import { lectureChipLabel, lectureTitlesFor, revisionHealth } from "@inkboard/shared/planner/revision-health";
import { revisionBookmarkLine } from "@inkboard/shared/planner/bookmarks";
import type { StudyPlan } from "@inkboard/shared/planner/types";

export function RevisionHealthPanel({ plan, today }: { plan: StudyPlan; today: string }) {
  const health = revisionHealth(plan, today);
  if (!health.total && !health.shaky.length) return null;
  const marks = [
    { n: health.due.length, label: "due" },
    { n: health.overdue.length, label: "overdue" },
    { n: health.shaky.length, label: "shaky" },
  ];
  return (
    <section id="revision-health" aria-label="Revision health">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Revision</p>
      <p className="mt-2 flex gap-4 text-xs text-fg-muted">
        {marks.map((m) => (
          <span key={m.label} className="inline-flex items-center gap-1.5">
            <span className={`rev-hatch${m.n ? " is-on" : ""}`} aria-hidden="true" />
            <span className="tabular">
              {m.n} {m.label}
            </span>
          </span>
        ))}
      </p>
      <ul className="mt-3">
        {[...health.overdue, ...health.due].slice(0, 4).map((t) => {
          const covers = lectureTitlesFor(plan, t.refLessonIds);
          const stamps = revisionBookmarkLine(t.refLessonIds);
          return (
            <li key={t.id} className="border-t border-line py-2 text-sm">
              <p className={t.date < today ? "text-warn" : ""}>{t.title}</p>
              {covers.length ? <p className="truncate text-xs text-fg-faint">{covers.map((c) => lectureChipLabel(c)).join(" · ")}</p> : null}
              {stamps ? <p className="truncate text-xs text-fg-muted">{stamps}</p> : null}
            </li>
          );
        })}
      </ul>
      {health.shaky.length ? (
        <p className="mt-2 text-xs text-warn">Shaky: {health.shaky.map((r) => r.lessonId).slice(0, 3).join(", ")}</p>
      ) : null}
      <Link to="/planner/analytics" className="mt-2 inline-block text-xs text-fg-muted hover:text-fg">
        Open instruments
      </Link>
    </section>
  );
}
