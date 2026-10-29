import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon, Clock3, KeyRound, Radio, Share2, UserPlus } from "lucide-react";
import { Avatar, Badge, Button, EmptyState, ErrorState, List, ListRow, Section, Skeleton, Surface } from "@/components/ui";
import { ActivityFeed, DayBars, StatTile } from "@/components/admin/bits";
import { get, type MemberRow, type Overview } from "@/components/admin/api";
import { fmtAgo, fmtMinutes } from "@/lib/session";
import { OnlineNow } from "./online-now";

export function MemberLine({ m }: { m: MemberRow }) {
  return (
    <ListRow
      density="compact"
      leading={<Avatar name={m.name} size="sm" decorative />}
      title={
        <Link to="/admin" search={{ member: m.id }} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {m.name}
        </Link>
      }
      badge={m.status === "disabled" ? <Badge tone="warn">Paused</Badge> : undefined}
      meta={
        <>
          <span>{fmtMinutes(m.stats?.watchSeconds7d ?? 0)} this week</span>
          <span>· seen {fmtAgo(m.lastSeenAt)}</span>
        </>
      }
    />
  );
}

export function OverviewTab({ onGo }: { onGo: (tab: string) => void }) {
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: () => get<Overview>("/api/admin/overview"), refetchInterval: 30_000 });
  if (q.isLoading) return <Skeleton className="h-72" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  if (!d.counts.members) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Add your first member"
        body="Members sign in with the email and password you set. Then share an exam, teacher or course with them."
        action={
          <>
            <Button icon={UserPlus} onClick={() => onGo("members")}>
              Add a member
            </Button>
            <Button variant="secondary" icon={Share2} onClick={() => onGo("sharing")}>
              Share content
            </Button>
          </>
        }
      />
    );
  }
  const ranked = [...d.members].sort((a, b) => (b.stats?.watchSeconds7d ?? 0) - (a.stats?.watchSeconds7d ?? 0));
  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Online now" value={d.counts.onlineNow} hint={`of ${d.counts.members} members`} icon={Radio} />
        <StatTile label="Studied this week" value={d.counts.activeThisWeek} hint="members with any activity" icon={ActivityIcon} />
        <StatTile label="Watch time · 7 days" value={fmtMinutes(d.counts.watchSeconds7d)} hint="across all members" icon={Clock3} />
        <StatTile label="Shared items" value={d.counts.shares} hint={d.accessMode === "open" ? "Open mode: members see everything" : `${d.counts.groups} group${d.counts.groups === 1 ? "" : "s"}`} icon={Share2} />
      </div>
      {d.counts.resetRequests ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-subtle p-4 text-sm">
          <p className="flex items-center gap-2 text-fg">
            <KeyRound aria-hidden="true" className="size-4 text-danger" />
            {d.counts.resetRequests === 1 ? "A member asked for a password reset" : `${d.counts.resetRequests} members asked for a password reset`} from the sign-in page.
          </p>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/admin" search={{ tab: "members" }}>
              Open members
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Surface>
          <DayBars days={d.daily} label="Minutes watched per day (14 days)" empty="No member has watched a class in the last 14 days. Share an exam or course to get them started." />
        </Surface>
        <Surface>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
            <span aria-hidden="true" className="size-2 rounded-full bg-ok" />
            Online now
          </h2>
          <OnlineNow items={d.online} />
        </Surface>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Members this week" action={<Button variant="ghost" size="sm" onClick={() => onGo("members")}>All members</Button>}>
          <List label="Members by watch time">
            {ranked.slice(0, 6).map((m) => (
              <MemberLine key={m.id} m={m} />
            ))}
          </List>
        </Section>
        <Section title="Last hour" description="Raw activity is kept for one hour; daily totals are kept for charts." action={<Button variant="ghost" size="sm" onClick={() => onGo("activity")}>Full log</Button>}>
          <ActivityFeed items={d.recent.slice(0, 10)} showUser empty="No activity in the last hour." />
        </Section>
      </div>

      <Section title="Most watched" description="Last 30 days">
        {d.topLessons.length ? (
          <Surface>
            <ol className="m-0 grid list-none gap-2 p-0">
              {d.topLessons.map((l, i) => (
                <li key={l.ref} className="flex items-center gap-3 text-sm">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-fg-faint tabular-nums">{i + 1}</span>
                  <Link to="/play/$lessonId" params={{ lessonId: l.ref }} search={{ title: l.label }} className="min-w-0 flex-1 truncate text-fg hover:underline">
                    {l.label || l.ref}
                  </Link>
                  <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                    {l.members} {l.members === 1 ? "member" : "members"} · {fmtMinutes(l.seconds)}
                  </span>
                </li>
              ))}
            </ol>
          </Surface>
        ) : (
          <p className="text-sm text-fg-muted">No classes watched yet.</p>
        )}
      </Section>
    </div>
  );
}

