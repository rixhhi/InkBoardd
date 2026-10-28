import { useMemo, useState, useSyncExternalStore } from "react";

import { KitSelect, SegmentedControl } from "@/components/ui/planner/kit.tsx";
import { Card, Progress, Ring } from "@/components/ui";


import { evaluateBadges, getServerBadges, readEarnedBadges, subscribeBadges, withEarnedDates, type BadgeCategory, type BadgeProgress } from "@inkboard/shared/planner/badges";

import { todayKey } from "@inkboard/shared/planner/dates";

import { getServerSessions, liveSessions, subscribeSessions } from "@inkboard/shared/planner/sessions";

import { comebackCount, isCaughtUp } from "@inkboard/shared/planner/streaks";

import { usePlanner } from "@inkboard/shared/planner/use-planner";

const CATS: BadgeCategory[] = ["Consistency", "Lectures", "Time", "Revision", "Reflection", "Comeback"];

export default function BadgesPage() {
  const { state, plan, streak } = usePlanner();
  const date = todayKey();
  const [status, setStatus] = useState<"all" | "earned" | "locked">("all");
  const [cat, setCat] = useState<BadgeCategory | "">("");
  const sessions = useSyncExternalStore(subscribeSessions, liveSessions, getServerSessions);
  const earnedRows = useSyncExternalStore(subscribeBadges, readEarnedBadges, getServerBadges);
  const list = useMemo(() => {
    const progress = withEarnedDates(
      evaluateBadges({
        state,
        plan,
        streak,
        sessions,
        comebacks: comebackCount(state.days, plan?.tasks ?? [], date, plan?.prefs.streakMinutes ?? 20, plan?.prefs),
        caughtUp: plan ? isCaughtUp(plan.tasks, date) : false,
      }),
      earnedRows,
    );
    return progress.filter((b) => {
      if (status === "earned" && !b.earned) return false;
      if (status === "locked" && b.earned) return false;
      if (cat && b.category !== cat) return false;
      return true;
    });
  }, [state, plan, streak, date, status, cat, sessions, earnedRows]);
  const earned = list.filter((b) => b.earned).length;
  const todayEarned = list.filter((b) => b.earnedAt?.startsWith(date));

  const total = list.length;
  const nextUp = list.filter((b) => !b.earned).sort((a, b) => b.percent - a.percent).slice(0, 3);

  return (
    <div className="py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Seals</p>
          <h1 className="chalk-draw mt-1 font-serif text-display">Stamp sheet</h1>
          <p className="mt-2 text-sm tabular text-fg-muted">
            {earned} earned · {list.filter((b) => !b.earned).length} empty
          </p>
        </div>
        <Ring value={total ? (earned / total) * 100 : 0} label={`${earned} of ${total} seals earned`} size={56} />
      </header>
      {nextUp.length ? (
        <section className="mt-5" aria-labelledby="seals-next">
          <h2 id="seals-next" className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Closest to earning</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {nextUp.map((b) => (
              <li key={b.id}>
                <Card padded className="h-full">
                  <p className="text-sm font-medium text-fg">{b.title}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{b.criteria}</p>
                  <div className="mt-2">
                    <Progress value={b.percent} label={`${b.title} ${b.percent}%`} />
                  </div>
                  <p className="mt-1 text-xs tabular text-fg-faint">{Math.min(b.value, b.target)} / {b.target}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SegmentedControl
          ariaLabel="Seal status"
          value={status}
          onChange={setStatus}
          options={[
            { id: "all", label: "All" },
            { id: "earned", label: "Earned" },
            { id: "locked", label: "Empty" },
          ]}
        />
        <KitSelect
          value={cat}
          onChange={(v) => setCat(v as BadgeCategory | "")}
          ariaLabel="Seal category"
          options={[{ id: "", label: "All categories" }, ...CATS.map((c) => ({ id: c, label: c }))]}
        />
      </div>
      {CATS.filter((c) => list.some((b) => b.category === c)).map((c) => {
        const group = list.filter((b) => b.category === c);
        const got = group.filter((b) => b.earned).length;
        return (
          <section key={c} className="mt-10" aria-label={c}>
            <h2 className="text-xs font-semibold tracking-wide text-fg-faint uppercase">
              {c} · {got}/{group.length}
            </h2>
            <ul className="seal-sheet mt-4">
              {group.map((b) => (
                <SealCard key={b.id} badge={b} today={todayEarned.some((x) => x.id === b.id)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function SealCard({ badge, today }: { badge: BadgeProgress; today: boolean }) {
  const cls = `seal${badge.earned ? " is-earned" : " is-empty"}${today ? " is-today" : ""}`;
  return (
    <li className={cls}>
      <p className="seal-title">{badge.title}</p>
      <p className="seal-meta">{badge.tier}</p>
      <p className="mt-2 text-xs leading-snug text-fg-muted">{badge.earned ? badge.earnedAt?.slice(0, 10) ?? "Earned" : badge.criteria}</p>
      {!badge.earned && badge.percent > 0 ? (
        <div className="mt-2" aria-hidden={badge.percent === 0}>
          <div className="h-1 w-full overflow-hidden rounded-full bg-fg/10">
            <div className="h-full bg-fg/60" style={{ width: `${badge.percent}%` }} />
          </div>
          <p className="mt-1 text-[10px] tabular text-fg-faint">{Math.min(badge.value, badge.target)} / {badge.target}</p>
        </div>
      ) : null}
    </li>
  );
}
