import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { moveTab } from "@/lib/a11y-tabs";
import { FIELD } from "./input";

/* ---------------- Tabs ---------------- */

export type TabDef = { id: string; label: string; icon?: LucideIcon; count?: number };

/** Roving-focus tablist. Parent owns `value`; pair with `TabPanel`. Use `useTabParam` to sync with the URL. */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
  className,
  size = "md",
  panels = false,
}: {
  tabs: readonly TabDef[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
  /** Set when the page renders a matching <TabPanel id=…> for the selected tab. */
  panels?: boolean;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]", className)}>
      {tabs.map((tab) => {
        const selected = value === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            // Only reference a panel that exists: most pages swap content without a TabPanel,
            // and a dangling aria-controls is an axe "critical".
            aria-controls={panels ? `panel-${tab.id}` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              const next = moveTab(
                tabs.map((t) => t.id),
                value,
                e.key,
              );
              if (!next) return;
              e.preventDefault();
              onChange(next);
              document.getElementById(`tab-${next}`)?.focus();
            }}
            className={cn(
              "relative -mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors duration-[var(--dur-fast)]",
              "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              size === "sm" ? "h-9 px-2.5 text-sm" : "h-11 px-3 text-sm",
              selected ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
            {tab.label}
            {tab.count != null ? <span className="rounded-sm bg-surface-raised px-1 font-mono text-[11px] text-fg-muted tabular-nums">{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, active, children, className }: { id: string; active: boolean; children: ReactNode; className?: string }) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className={cn("outline-none", className)}>
      {children}
    </div>
  );
}

/* ---------------- Switch ---------------- */

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-fg">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-[var(--dur-fast)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-1 transition-transform duration-[var(--dur-fast)]", checked && "translate-x-4")}
        />
      </button>
    </div>
  );
}

/* ---------------- Select ---------------- */

export function Select({
  label,
  value,
  onChange,
  options,
  hideLabel = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  hideLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-sm font-medium text-fg", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(FIELD, "appearance-none pr-9")}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-faint" />
      </div>
    </div>
  );
}

/* ---------------- Tooltip ---------------- */

/** Hover/focus tooltip. The trigger must already have its own accessible name. */
export function Tooltip({ label, children, side = "top" }: { label: string; children: ReactNode; side?: "top" | "bottom" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-[var(--z-toast)] -translate-x-1/2 rounded-sm bg-fg px-2 py-1 text-xs whitespace-nowrap text-bg opacity-0 shadow-2 transition-opacity delay-300 duration-[var(--dur-fast)]",
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {label}
      </span>
    </span>
  );
}

/* ---------------- Menu ---------------- */

export type MenuItem = { id: string; label: string; icon?: LucideIcon; onSelect: () => void; checked?: boolean; danger?: boolean; hint?: string };

/** Dropdown menu with arrow-key navigation. `trigger` renders the button; it gets aria props injected. */
export function Menu({
  label,
  items,
  trigger,
  align = "end",
  side = "bottom",
  open: openProp,
  onOpenChange,
  header,
}: {
  label: string;
  items: readonly (MenuItem | "separator")[];
  trigger: (props: { "aria-haspopup": "menu"; "aria-expanded": boolean; onClick: () => void; ref: (el: HTMLButtonElement | null) => void }) => ReactNode;
  align?: "start" | "end";
  side?: "bottom" | "top";
  /** Controlled mode. Omit for internal state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional non-interactive row above the items (e.g. a slider). */
  header?: ReactNode;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (openProp === undefined) setOpenState(value);
    onOpenChange?.(value);
  };
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selectable = items.filter((i): i is MenuItem => i !== "separator");

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelectorAll<HTMLElement>("[role=menuitem],[role=menuitemcheckbox]")[active]?.focus();
  }, [open, active]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      {trigger({
        "aria-haspopup": "menu",
        "aria-expanded": open,
        onClick: () => setOpen((v) => !v),
        ref: (el) => {
          triggerRef.current = el;
        },
      })}
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            "absolute z-[var(--z-sheet)] min-w-52 rounded-md bg-surface p-1 shadow-3 [animation:ui-fade-in_var(--dur-fast)_var(--ease-out)]",
            side === "top" ? "bottom-full mb-1" : "top-full mt-1",
            align === "end" ? "right-0" : "left-0",
          )}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((n) => (n + 1) % selectable.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((n) => (n - 1 + selectable.length) % selectable.length);
            } else if (e.key === "Home") {
              e.preventDefault();
              setActive(0);
            } else if (e.key === "End") {
              e.preventDefault();
              setActive(selectable.length - 1);
            }
          }}
        >
          {header ? <div className="px-2.5 py-2">{header}</div> : null}
          {items.map((item, i) => {
            if (item === "separator") return <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-line" />;
            const Icon = item.icon;
            const idx = selectable.indexOf(item);
            return (
              <button
                key={item.id}
                type="button"
                role={item.checked != null ? "menuitemcheckbox" : "menuitem"}
                aria-checked={item.checked}
                tabIndex={idx === active ? 0 : -1}
                onClick={() => {
                  item.onSelect();
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm outline-none touch:min-h-[var(--hit-min)]",
                  "hover:bg-surface-raised focus-visible:bg-surface-raised",
                  item.danger ? "text-danger" : "text-fg",
                )}
              >
                {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-fg-muted" /> : null}
                <span className="flex-1">{item.label}</span>
                {item.hint ? <span className="font-mono text-[11px] text-fg-faint">{item.hint}</span> : null}
                {item.checked ? <Check aria-hidden="true" className="size-4 text-accent" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Segmented ---------------- */

/**
 * One choice from a few options, shown as a pill group (theme, pace, text size…).
 * Buttons with aria-pressed so it works with every screen reader and keyboard.
 */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  hideLabel = false,
  size = "md",
  className,
}: {
  label: string;
  value: T | null;
  onChange: (value: T) => void;
  options: readonly { value: T; label: ReactNode; hint?: string }[];
  hideLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("grid gap-1.5", className)}>
      <span id={id} className={hideLabel ? "sr-only" : "text-sm font-medium text-fg"}>
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="inline-flex w-full flex-wrap gap-1 rounded-lg bg-surface-raised p-1 sm:w-auto">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              title={o.hint}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex-1 rounded-md px-3 font-medium whitespace-nowrap transition-colors duration-[var(--dur-fast)] sm:flex-none",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
                on ? "bg-surface text-fg shadow-1" : "text-fg-muted hover:text-fg",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A labelled checkbox row in kit style. */
export function Check2({ checked, onCheckedChange, label, description }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; description?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]" />
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-fg-muted">{description}</span> : null}
      </label>
    </div>
  );
}
