import { useEffect, useState } from "react";
import { DeskSkip } from "@/components/folio/skip-link";
import { Button, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { COPY } from "@inkboard/shared/copy";

/** A labelled spinner. After a few seconds it says the server may be waking up. */
export function Fetching({
  label,
  compact = false,
  onRetry,
}: {
  label: string;
  compact?: boolean;
  onRetry?: () => void;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 6_000);
    return () => clearTimeout(timer);
  }, [label]);
  return <FetchingView label={label} compact={compact} slow={slow} onRetry={onRetry} />;
}

/** Used while a route chunk loads, before the page shell exists. */
export function RouteFallback({ label }: { label: string }) {
  return (
    <>
      <DeskSkip />
      <main id="main" className="page-pad pt-8">
        <Fetching label={label} />
        <div aria-hidden="true" className="mt-8 grid gap-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="mt-4 h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </main>
    </>
  );
}

/** Kit spinner: one ring, token colours, stops under reduced motion via the ui-spin keyframe. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-5 shrink-0 rounded-full border-2 border-line border-t-fg [animation:ui-spin_0.8s_linear_infinite]", className)}
    />
  );
}

export function FetchingView({
  label,
  compact = false,
  slow,
  onRetry,
}: {
  label: string;
  compact?: boolean;
  slow: boolean;
  onRetry?: () => void;
}) {
  const Label = compact ? "p" : "h1";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        compact
          ? "flex items-center gap-2.5 py-3 text-sm text-fg-muted"
          : "grid min-h-56 place-items-center content-center gap-3 px-4 py-10 text-center",
      )}
    >
      <Spinner className={compact ? "size-4" : "size-6"} />
      <Label className={cn("m-0 max-w-[var(--measure)]", compact ? "text-sm text-fg-muted" : "text-base font-medium text-fg")}>{label}</Label>
      {slow ? <p className="m-0 max-w-[var(--measure)] text-sm text-fg-muted">{COPY.serverWaking}</p> : null}
      {slow ? (
        <Button variant="secondary" size="sm" onClick={() => (onRetry ? onRetry() : window.location.reload())}>
          {COPY.tryAgain}
        </Button>
      ) : null}
    </div>
  );
}
