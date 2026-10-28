import { useEffect, useState } from "react";
import { toast } from "sonner";
import { isBehind, oldestOverdueIds, showCatchUp } from "@inkboard/shared/planner/daily";
import { describeDiff, previewReschedule } from "@inkboard/shared/planner/scheduler";
import { reschedulePlan, skipOldestOverdue, undoLast } from "@inkboard/shared/planner/storage";
import type { PlanTask, PlannerPrefs } from "@inkboard/shared/planner/types";

type Option = "spread" | "push" | "skip-oldest";

/** Catch-up as an inscription, not a banner. */
export function CatchUpLines({
  planId,
  tasks,
  prefs,
  today,
  force = false,
}: {
  planId: string;
  tasks: PlanTask[];
  prefs: PlannerPrefs;
  today: string;
  force?: boolean;
}) {
  const [pending, setPending] = useState<Option | null>(null);
  const behind = isBehind(tasks, today, prefs);
  const open = showCatchUp(behind, force);

  useEffect(() => {
    if (!force) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("catch-up")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, [force]);

  if (!open) return null;

  const preview = pending ? previewCopy(pending, tasks, prefs, today) : "";

  function apply(kind: Option) {
    if (kind === "skip-oldest") {
      skipOldestOverdue(planId, today);
      toast.success("Skipped the oldest overdue class", { action: { label: "Undo", onClick: () => undoLast() } });
    } else {
      const { diff } = reschedulePlan(planId, kind, today);
      toast.success(kind === "spread" ? `Absorb · ${describeDiff(diff)}` : describeDiff(diff), {
        action: { label: "Undo", onClick: () => undoLast() },
      });
    }
    setPending(null);
  }

  return (
    <div id="catch-up" tabIndex={-1} className="text-sm text-warn" role="status">
      <p>{behind ? "A couple of study days behind." : "Catch up or stretch the plan."}</p>
      <p className="mt-0.5 text-fg-muted">Pick one — we won't stack more than one extra lecture a day.</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" className="h-11 text-sm text-accent" onClick={() => setPending("spread")}>
          Absorb (+1/day for 3 days)
        </button>
        <button type="button" className="h-11 text-sm text-fg-muted hover:text-fg" onClick={() => setPending("push")}>
          Push dates
        </button>
        <button type="button" className="h-11 text-sm text-fg-muted hover:text-fg" onClick={() => setPending("skip-oldest")}>
          Skip oldest
        </button>
      </div>
      {pending ? (
        <div className="mt-3 border border-line px-3 py-2">
          <p className="text-xs text-fg-muted">{preview}</p>
          <div className="mt-2 flex gap-3">
            <button type="button" className="h-11 text-sm text-accent" onClick={() => apply(pending)}>
              Confirm
            </button>
            <button type="button" className="h-11 text-sm text-fg-muted" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function previewCopy(kind: Option, tasks: PlanTask[], prefs: PlannerPrefs, today: string) {
  if (kind === "skip-oldest") {
    const n = oldestOverdueIds(tasks, today).length;
    return `Skip ${n} oldest overdue ${n === 1 ? "class" : "classes"}.`;
  }
  const { diff } = previewReschedule(tasks, prefs, today, kind === "spread" ? "spread" : "push");
  return describeDiff(diff);
}

export const BehindBanner = CatchUpLines;

export function PaceCatchUpButton({
  label,
  warn,
  onOpen,
}: {
  label: string;
  warn?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`inline-flex h-11 max-w-full min-w-0 items-center px-1 text-sm ${warn ? "text-warn" : "text-fg-muted"}`}
      aria-controls="catch-up"
    >
      {label}
    </button>
  );
}
