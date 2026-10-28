import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Keyboard hint. Never the only label for an action. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-surface-raised px-1.5 font-mono text-[11px] leading-none text-fg-muted shadow-1",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Space-separated keys: <Keys combo="Ctrl K" /> renders two Kbd chips. */
export function Keys({ combo, className }: { combo: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={combo}>
      {combo.split(" ").map((k, i) => (
        <Kbd key={`${k}-${i}`}>{k}</Kbd>
      ))}
    </span>
  );
}
