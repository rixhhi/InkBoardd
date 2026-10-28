import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/planner/confirm-dialog.tsx";
import { Input } from "@/components/ui";
import { archivePlan, deletePlan, duplicatePlan, patchPlan, setActivePlan, undoLast, visiblePlans } from "@inkboard/shared/planner/storage";
import { usePlanner } from "@inkboard/shared/planner/use-planner";

export function PlanSwitcher() {
  const { plan, state } = usePlanner();
  const plans = visiblePlans(state);
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(plan?.name ?? "");

  useEffect(() => {
    if (renaming) nameRef.current?.focus();
  }, [renaming]);
  if (!plan) {
    return (
      <Link to="/planner/new" className="inline-flex h-11 items-center text-sm font-semibold text-accent hover:underline">
        Lay out a plan
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className="h-11 max-w-full truncate rounded-sm text-left font-serif text-sm text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-expanded={open}
        aria-label={`Plan ${plan.name}`}
        onClick={() => setOpen((v) => !v)}
      >
        {plan.name}
      </button>
      {open ? (
        <ul className="mt-1 divide-y divide-line overflow-hidden rounded-md bg-surface shadow-1">
          {plans.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`flex h-11 w-full items-center text-left text-sm px-3 ${p.id === plan.id ? "font-medium text-accent" : "text-fg-muted hover:bg-surface-raised/60 hover:text-fg"}`}
                onClick={() => {
                  setActivePlan(p.id);
                  setOpen(false);
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
          <li>
            {renaming ? (
              <form
                className="p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = name.trim();
                  if (next) patchPlan(plan.id, { name: next });
                  setRenaming(false);
                }}
              >
                <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} aria-label="Plan name" />
              </form>
            ) : (
              <button
                type="button"
                className="flex h-11 w-full items-center px-3 text-left text-sm text-fg-muted hover:bg-surface-raised/60 hover:text-fg"
                onClick={() => {
                  setName(plan.name);
                  setRenaming(true);
                }}
              >
                Rename
              </button>
            )}
          </li>
          <li>
            <button
              type="button"
              className="flex h-11 w-full items-center px-3 text-left text-sm text-fg-muted hover:bg-surface-raised/60 hover:text-fg"
              onClick={() => {
                duplicatePlan(plan.id);
                toast.success("Duplicated", { action: { label: "Undo", onClick: () => undoLast() } });
                setOpen(false);
              }}
            >
              Duplicate
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex h-11 w-full items-center px-3 text-left text-sm text-fg-muted hover:bg-surface-raised/60 hover:text-fg"
              onClick={() => {
                archivePlan(plan.id);
                toast.success("Archived", { action: { label: "Undo", onClick: () => undoLast() } });
                setOpen(false);
              }}
            >
              Archive
            </button>
          </li>
          <li>
            <button
              type="button"
              className="flex h-11 w-full items-center px-3 text-left text-sm text-danger hover:bg-danger-subtle"
              onClick={() => setConfirmId(plan.id)}
            >
              Delete
            </button>
          </li>
          <li>
            <Link to="/planner/new" className="flex h-11 items-center px-3 text-sm font-medium text-accent hover:bg-surface-raised/60">
              Lay out a plan
            </Link>
          </li>
        </ul>
      ) : null}
      <ConfirmDialog
        open={Boolean(confirmId)}
        title="Delete this plan?"
        body="A recovery point is saved first. You can undo right after."
        confirmLabel="Delete plan"
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) {
            deletePlan(confirmId);
            toast.success("Plan deleted", { action: { label: "Undo", onClick: () => undoLast() } });
          }
          setConfirmId(null);
        }}
      />
    </>
  );
}
