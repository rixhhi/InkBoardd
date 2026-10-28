import { useEffect, useState } from "react";
import { describeError } from "@/lib/api-client";
import { COPY } from "@inkboard/shared/copy";

export function softFailure(error: unknown) {
  const described = describeError(error);
  if (described.kind === "ratelimit" || described.kind === "network") return described;
  return null;
}

export function CalmNotice({
  title,
  body,
  onRetry,
  seconds = 8,
  heading = 2,
}: {
  title: string;
  body: string;
  onRetry: () => void;
  seconds?: number;
  heading?: 1 | 2;
}) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);
  const Title = heading === 1 ? "h1" : "h2";
  return (
    <div className="ui-card measure" role="status">
      <Title className="text-base font-semibold">{title}</Title>
      <p className="mt-2 text-sm text-fg-muted">{body}</p>
      <p className="mt-2 text-sm text-fg-muted">{left > 0 ? `Try again in ${left}s` : "You can try again now."}</p>
      <button type="button" className="btn is-secondary mt-4" onClick={onRetry}>
        {COPY.tryAgain}
      </button>
    </div>
  );
}