import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { advanceFocusRun, endFocusRun, nextFocusTask, readFocusRun } from "@inkboard/shared/planner/focus";
import { completeLessonInPlan, flushPlannerWatch, recordWatchTick, todaysTasks } from "@inkboard/shared/planner/storage";
import { activePlan } from "@inkboard/shared/planner/storage";
import { usePlannerSnapshot } from "@inkboard/shared/planner/use-planner";

export function PlannerPlayerChip({
  lessonId,
  watchedSec,
  durationSec,
  focus,
}: {
  lessonId: string;
  watchedSec: number;
  durationSec: number;
  focus?: boolean;
}) {
  const state = usePlannerSnapshot();
  const plan = activePlan(state);
  const lastT = useRef(watchedSec);
  const toasted = useRef(false);
  const nav = useNavigate();
  const planId = plan?.id ?? null;

  useEffect(() => {
    lastT.current = watchedSec;
    toasted.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  useEffect(() => {
    if (!planId) {
      lastT.current = watchedSec;
      return;
    }
    const hidden = typeof document !== "undefined" && document.hidden;
    const r = recordWatchTick(lessonId, lastT.current, watchedSec, hidden, durationSec);
    lastT.current = r.nextPrev;
    if (r.autoCompleted && !toasted.current) {
      toasted.current = true;
      if (focus) {
        const current = activePlan();
        const run = readFocusRun();
        const nxt = nextFocusTask(current?.tasks ?? [], run);
        advanceFocusRun();
        if (nxt?.lessonId) {
          void nav({
            to: "/play/$lessonId",
            params: { lessonId: nxt.lessonId },
            search: { title: nxt.title, teacher: nxt.teacher, course: nxt.courseId ?? undefined, focus: 1 },
          });
        } else {
          endFocusRun();
          void nav({ to: "/planner/today", search: { add: undefined } });
        }
      }
    }
  }, [watchedSec, durationSec, lessonId, planId, focus, nav]);

  useEffect(() => () => flushPlannerWatch(), []);

  void completeLessonInPlan;
  void todaysTasks;

  return null;
}
