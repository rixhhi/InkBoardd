import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { COPY } from "@inkboard/shared/copy";
import { plannerShortcutsActive } from "@inkboard/shared/planner/shortcuts-active";

const KEYS = [
  { key: "t", label: "Today" },
  { key: "c", label: "Month" },
  { key: "d", label: "Pace" },
  { key: "n", label: "Write a task" },
  { key: "l", label: "Log a session" },
  { key: "?", label: "This help" },
  { key: "⌘K", label: COPY.search },
  { key: "⌘B", label: "Fold the ledger" },
];

function typingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function dialogOpen() {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"], [aria-modal="true"]'));
}

export function PlannerShortcuts() {
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const active = plannerShortcutsActive(pathname);

  useEffect(() => {
    if (!active) {
      setOpen(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "?" || (e.shiftKey && k === "/")) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (open || dialogOpen()) return;
      if (k === "t") {
        e.preventDefault();
        void nav({ to: "/planner/today", search: { add: undefined } });
      } else if (k === "c") {
        e.preventDefault();
        void nav({ to: "/planner", search: { day: undefined } });
      } else if (k === "d") {
        e.preventDefault();
        void nav({ to: "/planner/dashboard" });
      } else if (k === "n") {
        e.preventDefault();
        void nav({ to: "/planner/today", search: { add: 1 } });
      } else if (k === "l") {
        e.preventDefault();
        void nav({ to: "/planner/history", search: { log: 1 } });
        toast.message("Log a session from History");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, open, active]);

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[85] bg-overlay" />
        <AlertDialog.Content className="dialog-sheet fixed top-1/2 left-1/2 z-[85] -translate-x-1/2 -translate-y-1/2">
          <AlertDialog.Title className="font-serif text-base font-semibold">{COPY.shortcuts}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-sm text-fg-muted">Marks on the keys</AlertDialog.Description>
          <ul className="mt-3 space-y-2 text-sm">
            {KEYS.map((row) => (
              <li key={row.key} className="flex h-11 items-center justify-between gap-3 border-b border-line">
                <span>{row.label}</span>
                <kbd className="text-xs text-fg-muted">{row.key}</kbd>
              </li>
            ))}
          </ul>
          <AlertDialog.Cancel className="mt-4 h-11 text-sm font-semibold text-accent">Close</AlertDialog.Cancel>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
