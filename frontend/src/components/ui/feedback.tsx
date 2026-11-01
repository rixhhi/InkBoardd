import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CloudOff, Hourglass, Lock, SearchX, ServerCrash, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Surface } from "./surface";

export { toast } from "sonner";

/** Inline notice (not the sonner toast). */
export function Toast({ title, body, tone = "neutral" }: { title: string; body?: ReactNode; tone?: "neutral" | "warn" | "danger" }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-md px-4 py-3 shadow-1",
        tone === "warn" ? "bg-warn-subtle" : tone === "danger" ? "bg-danger-subtle" : "bg-surface",
      )}
    >
      <p className="text-sm font-semibold text-fg">{title}</p>
      {body ? <p className="mt-0.5 text-sm text-fg-muted">{body}</p> : null}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-[linear-gradient(90deg,var(--color-surface-raised)_0%,var(--color-surface)_45%,var(--color-surface-raised)_100%)] bg-[length:200%_100%] [animation:ui-shimmer_1.4s_ease-in-out_infinite]", className)}
    />
  );
}

/** N identical placeholders. Position is the only identity a placeholder has, so the index key is the right one here. */
export function SkeletonRows({ count, className }: { count: number; className?: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders that never reorder
        <Skeleton key={i} className={className} />
      ))}
    </>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  /** Kept for callers; the empty state now draws an ink stroke instead of an icon tile. */
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Surface role="status" className={cn("enter text-center", className)}>
      {/* A drawn stroke, not an icon in a tinted square: empty space on a board is still a board. */}
      <svg aria-hidden="true" viewBox="0 0 112 16" className="ink-empty-stroke mb-3">
        <path d="M2 9c8-6 14 4 22 1s12-7 20-3 10 8 18 4 12-8 20-3 12 6 18 3 8-5 10-3" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      </svg>
      <p className="font-serif text-lg font-semibold text-fg">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-[var(--measure)] text-sm text-fg-muted">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </Surface>
  );
}

export type ErrorKind = "not-found" | "locked" | "rate-limit" | "upstream" | "offline" | "generic";

/** Map an API error (ApiError or anything) onto the kinds ErrorState knows how to explain. */
export function errorKind(err: unknown): ErrorKind {
  const e = (err && typeof err === "object" ? err : null) as { status?: unknown; code?: unknown } | null;
  const hasStatus = typeof e?.status === "number";
  const status = hasStatus ? (e!.status as number) : -1;
  const code = typeof e?.code === "string" ? e.code : "";
  if (code === "NOT_SHARED" || code === "FEATURE_OFF" || code === "ADMIN_ONLY" || status === 403) return "locked";
  if (status === 404 || status === 410 || code === "NOT_FOUND" || code === "ARCHIVED") return "not-found";
  if (status === 429 || code === "RATE_LIMIT" || code === "UPSTREAM_RATE_LIMIT") return "rate-limit";
  if ((hasStatus && status === 0) || code === "NETWORK" || code === "OFFLINE") return "offline";
  if (status >= 500 || code.startsWith("UPSTREAM") || code === "TIMEOUT" || code === "BAD_RESPONSE") return "upstream";
  return "generic";
}

const ERROR_COPY: Record<ErrorKind, { icon: LucideIcon; title: string; body: string }> = {
  "not-found": { icon: SearchX, title: "This isn’t here", body: "The link may be old, or the class was taken down." },
  locked: { icon: Lock, title: "Not shared with you", body: "Ask your admin to share it. Everything shared with you is on your dashboard." },
  "rate-limit": { icon: Hourglass, title: "Slow down a little", body: "Too many requests in a minute. It opens again shortly." },
  upstream: { icon: ServerCrash, title: "The catalog didn’t answer", body: "Unacademy is slow or down. Your saved work is fine." },
  offline: { icon: CloudOff, title: "You’re offline", body: "Saved classes and the planner still work." },
  generic: { icon: TriangleAlert, title: "Something went wrong", body: "Try again. If it keeps happening, reload the page." },
};

/**
 * One error surface for every page. Pass the raw error (kind is derived) or a kind.
 * `heading` renders the title as the page h1 for full-page failures.
 * Rate-limit shows a live countdown when `retryAfterSec` is given.
 */
export function ErrorState({
  error,
  kind: given,
  title,
  body,
  onRetry,
  retryLabel = "Try again",
  retryAfterSec,
  heading = false,
  action,
  className,
}: {
  error?: unknown;
  kind?: ErrorKind;
  title?: string;
  body?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  retryAfterSec?: number;
  heading?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  const kind = given ?? errorKind(error);
  const copy = ERROR_COPY[kind];
  // Retrying cannot open something that isn't shared; offer the page's own way onward instead.
  if (kind === "locked") onRetry = undefined;
  const Icon = copy.icon;
  const [left, setLeft] = useState(retryAfterSec ?? 0);
  useEffect(() => {
    setLeft(retryAfterSec ?? 0);
    if (!retryAfterSec) return;
    const t = setInterval(() => setLeft((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(t);
  }, [retryAfterSec]);
  const Title = heading ? "h1" : "p";
  return (
    <Surface role="alert" className={cn("text-center [animation:ui-fade-in_var(--dur-base)_var(--ease-out)]", className)}>
      <div className={cn("mx-auto mb-3 flex size-11 items-center justify-center rounded-lg", kind === "rate-limit" || kind === "locked" ? "bg-warn-subtle" : "bg-danger-subtle")}>
        <Icon aria-hidden="true" className={cn("size-5", kind === "rate-limit" || kind === "locked" ? "text-warn" : "text-danger")} />
      </div>
      <Title className={cn("font-semibold text-fg", heading ? "text-2xl" : "text-lg")}>{title ?? copy.title}</Title>
      <p className="mx-auto mt-1.5 max-w-[var(--measure)] text-sm text-fg-muted">{body ?? copy.body}</p>
      {left > 0 ? (
        <p className="mt-2 font-mono text-sm text-fg-muted tabular-nums" aria-live="polite">
          {left}s
        </p>
      ) : null}
      {onRetry || action ? (
        <div className="mt-4 flex justify-center gap-2">
          {onRetry ? (
            <Button variant="secondary" onClick={onRetry} disabled={left > 0}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </Surface>
  );
}

export function Progress({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}
    >
      <span className="block h-full rounded-full bg-accent transition-[width] duration-[var(--dur-base)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Watched-percentage ring for list rows. */
export function Ring({ value, label, size = 36, className }: { value: number; label: string; size?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn("grid shrink-0 place-items-center rounded-full font-mono text-[11px] text-fg-muted tabular-nums", className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--color-accent) ${pct * 3.6}deg, var(--color-line) 0)`,
      }}
    >
      <span className="grid place-items-center rounded-full bg-surface" style={{ width: size - 6, height: size - 6 }}>
        {pct}
      </span>
    </div>
  );
}
