import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "ok" | "warn" | "danger" | "info" | "live" | "accent";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-raised text-fg-muted",
  ok: "bg-ok-subtle text-ok",
  warn: "bg-warn-subtle text-warn",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info",
  accent: "bg-accent-subtle text-accent",
  live: "bg-live text-live-fg",
};

/** Status label. Text is always present; colour is never the only signal. */
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-[11px] font-semibold tracking-wide uppercase",
        TONE[tone],
        tone === "live" && "animate-pulse",
        className,
      )}
    >
      {tone === "live" ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Filter toggle. `pressed` drives aria-pressed; parent owns the state. */
export function Chip({
  pressed,
  children,
  className,
  tone,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean; tone?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap transition-colors duration-[var(--dur-fast)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        pressed ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg",
        className,
      )}
      style={tone ? ({ "--chip-tone": tone } as never) : undefined}
      {...props}
    >
      {tone ? <span aria-hidden="true" className="size-2 rounded-full" style={{ background: tone }} /> : null}
      {children}
    </button>
  );
}
