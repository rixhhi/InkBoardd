import { lazy, Suspense, type RefObject } from "react";
import type { Timeline } from "@inkboard/shared/dcn";
import { WidgetErrorBoundary } from "@/lib/error-component";

const Board = lazy(() => import("@/components/whiteboard").then((m) => ({ default: m.Whiteboard })));

export function LazyWhiteboard(props: {
  timeline: Timeline;
  videoRef: RefObject<HTMLVideoElement | null>;
  clockMs?: number;
  preferClock?: boolean;
  liveBackdrop?: string;
}) {
  return (
    <WidgetErrorBoundary title="The board didn’t draw">
      <Suspense fallback={null}>
        <Board {...props} />
      </Suspense>
    </WidgetErrorBoundary>
  );
}