/**
 * Weekly digest: one line per member — minutes this week vs last, active
 * days, lessons, streak, and how much of their ink is still crisp. Quietest
 * members first, so the person who needs a nudge is at the top. Replaces
 * opening Activity, Members and each Member detail to work this out.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Badge, ErrorState, Section, Skeleton } from "@/components/ui";
import { get } from "@/components/admin/api";
import type { SessionUser } from "@/lib/session";
import { fmtAgo } from "@/lib/session";

export type DigestRow = {
  member: SessionUser;
  minutes: number;
  minutesPrev: number;
  activeDays: number;
  lessons: number;
  streak: number;
  lastActivityAt: string | null;
  ink: { crisp: number; fading: number; ghost: number; total: number } | null;
};

export type Digest = {
  weekStart: string;
  rows: DigestRow[];
  totals: { minutes: number; minutesPrev: number; active: number; ghosts: number };
};

/** "+40%", "−15%", "new" (no previous week), or "—" (nothing either week). Pure, tested. */
export function deltaLabel(now: number, prev: number): { text: string; tone: "ok" | "warn" | "neutral" } {
  if (!now && !prev) return { text: "—", tone: "neutral" };
  if (!prev) return { text: "new", tone: "ok" };
  const pct = Math.round(((now - prev) / prev) * 100);
  if (Math.abs(pct) < 5) return { text: "same", tone: "neutral" };
  return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`, tone: pct > 0 ? "ok" : "warn" };
}

/** One sentence an admin can act on. Pure, tested. */
export function nudgeFor(r: DigestRow): string | null {
  if (!r.activeDays && r.minutesPrev) return "Quiet this week after a busy one — worth a message.";
  if (!r.activeDays) return "Has not opened a class this week.";
  if (r.ink && r.ink.total >= 5 && r.ink.ghost / r.ink.total >= 0.4) return `${r.ink.ghost} of ${r.ink.total} studied lessons are ghosts — reviews are overdue.`;
  if (r.minutesPrev && r.minutes < r.minutesPrev * 0.5) return "Half of last week's minutes.";
  if (r.streak >= 7) return `${r.streak}-day streak.`;
  return null;
}

export function WeekDigest() {
  const q = useQuery({ queryKey: ["admin", "digest"], queryFn: () => get<Digest>("/api/admin/digest"), refetchInterval: 60_000 });
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const total = deltaLabel(d.totals.minutes, d.totals.minutesPrev);
  return (
    <Section
      title="This week"
      description={`${d.totals.minutes} min across ${d.totals.active} of ${d.rows.length} members · ${total.text === "—" ? "nothing studied yet" : `${total.text} vs last week`}${d.totals.ghosts ? ` · ${d.totals.ghosts} ghost lessons to re-ink` : ""}`}
    >
      <ol className="digest-rows" aria-label="Members, quietest first">
        {d.rows.map((r) => {
          const delta = deltaLabel(r.minutes, r.minutesPrev);
          const nudge = nudgeFor(r);
          const inkPct = r.ink?.total ? Math.round((r.ink.crisp / r.ink.total) * 100) : null;
          return (
            <li key={r.member.id} className="digest-row">
              <Avatar name={r.member.name} size="sm" decorative />
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <Link to="/admin" search={{ member: r.member.id }} className="truncate font-medium text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {r.member.name}
                  </Link>
                  {r.member.status === "disabled" ? <Badge tone="warn">Paused</Badge> : null}
                  {r.streak >= 3 ? <Badge tone="ok">{r.streak}-day streak</Badge> : null}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-muted tabular">
                  <span>
                    <span className="text-fg">{r.minutes} min</span>
                    <span className={delta.tone === "warn" ? " text-warn" : delta.tone === "ok" ? " text-ok" : ""}> {delta.text}</span>
                  </span>
                  <span>{r.activeDays}/7 days</span>
                  <span>
                    {r.lessons} {r.lessons === 1 ? "lesson" : "lessons"}
                  </span>
                  {inkPct != null ? <span title={`${r.ink!.crisp} crisp · ${r.ink!.fading} fading · ${r.ink!.ghost} ghost`}>{inkPct}% ink crisp</span> : null}
                  <span>seen {fmtAgo(r.lastActivityAt)}</span>
                </p>
                {nudge ? <p className="mt-1 text-xs text-fg">{nudge}</p> : null}
              </div>
              {r.ink?.total ? <InkBar ink={r.ink} /> : null}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function InkBar({ ink }: { ink: NonNullable<DigestRow["ink"]> }) {
  const pct = (n: number) => `${(n / ink.total) * 100}%`;
  return (
    <span className="digest-ink" aria-hidden="true" title={`${ink.crisp} crisp · ${ink.fading} fading · ${ink.ghost} ghost`}>
      <span style={{ width: pct(ink.crisp) }} className="digest-ink-crisp" />
      <span style={{ width: pct(ink.fading) }} className="digest-ink-fading" />
      <span style={{ width: pct(ink.ghost) }} className="digest-ink-ghost" />
    </span>
  );
}
