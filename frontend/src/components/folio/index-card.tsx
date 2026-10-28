import type { ReactNode } from "react";

export function IndexCard({
  kicker,
  title,
  meta,
  progress,
  children,
  tilt = 0,
}: {
  kicker?: string;
  title: string;
  meta?: string;
  progress?: number;
  children?: ReactNode;
  tilt?: number;
}) {
  const pct = progress != null ? Math.max(0, Math.min(100, progress)) : null;
  return (
    <article
      className="index-card"
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
    >
      {kicker ? <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">{kicker}</p> : null}
      <p className="font-serif text-base font-semibold text-fg">{title}</p>
      {meta ? <p className="mt-1 text-xs text-fg-muted">{meta}</p> : null}
      {pct != null ? (
        <span className="mt-2 block h-px bg-line">
          <span className="block h-px bg-accent" style={{ width: `${pct}%` }} />
        </span>
      ) : null}
      {children}
    </article>
  );
}
