import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { evaluateBadges, persistNewlyEarned, withEarnedDates, type BadgeContext } from "@inkboard/shared/planner/badges";
import { liveSessions } from "@inkboard/shared/planner/sessions";
import { comebackCount, computeStreaks, isCaughtUp } from "@inkboard/shared/planner/streaks";
import { todayKey } from "@inkboard/shared/planner/dates";
import { activePlan, readPlanner, subscribePlanner } from "@inkboard/shared/planner/storage";

export function BadgeWatcher() {
  const seen = useRef(false);
  useEffect(() => {
    function check() {
      const state = readPlanner();
      const plan = activePlan(state);
      const date = todayKey();
      const streak = computeStreaks(state.days, plan?.tasks ?? [], state.freezeWeeks, date, plan?.prefs.streakMinutes ?? 20, plan?.prefs);
      const ctx: BadgeContext = {
        state,
        plan,
        streak,
        sessions: liveSessions(),
        comebacks: comebackCount(state.days, plan?.tasks ?? [], date, plan?.prefs.streakMinutes ?? 20, plan?.prefs),
        caughtUp: plan ? isCaughtUp(plan.tasks, date) : false,
      };
      const progress = withEarnedDates(evaluateBadges(ctx));
      const fresh = persistNewlyEarned(progress, date);
      if (!seen.current) {
        seen.current = true;
        return;
      }
      for (const b of fresh) {
        toast.success(`Seal · ${b.title}`);
      }
    }
    check();
    return subscribePlanner(check);
  }, []);
  return null;
}
