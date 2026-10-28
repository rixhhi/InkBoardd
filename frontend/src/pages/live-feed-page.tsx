import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Radio } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Avatar, Badge, Dot, EmptyState, ErrorState, List, ListRow, PageBody, PageHeader, Section, Skeleton } from "@/components/ui";
import { loadLiveFeed } from "@/lib/unacademy";

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = d.getTime() - now;
  if (diff > 0 && diff < 90 * 60_000) return `in ${Math.max(1, Math.round(diff / 60_000))} min`;
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** Live now + next up across the catalog. */
export default function LiveFeedPage() {
  const q = useQuery({ queryKey: ["live-feed"], queryFn: ({ signal }) => loadLiveFeed(signal), refetchInterval: 60_000, staleTime: 30_000 });
  return (
    <AppShell>
      <PageHeader eyebrow="Live" title="Live classes" subline="Classes on air right now and the next ones scheduled. Refreshes every minute." />
      <PageBody>
        {q.isLoading ? (
          <div className="grid gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <Section title="On air" description={q.data?.live.length ? undefined : "Nothing is live at the moment."}>
              {q.data?.live.length ? (
                <List label="Live now">
                  {q.data.live.map((s) => (
                    <ListRow
                      key={s.classUid}
                      leading={<Avatar name={s.authorName} src={s.authorAvatar} size="md" decorative />}
                      title={
                        <Link to="/live/$classId" params={{ classId: s.classUid }} search={{ slug: s.classSlug, course: undefined }} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          {s.title}
                        </Link>
                      }
                      badge={<Badge tone="live">Live</Badge>}
                      meta={
                        <>
                          <span>{s.authorName}</span>
                          {s.goalName ? (
                            <>
                              <Dot />
                              <span>{s.goalName}</span>
                            </>
                          ) : null}
                          {s.attendance ? (
                            <>
                              <Dot />
                              <span>{s.attendance.toLocaleString()} in class</span>
                            </>
                          ) : null}
                        </>
                      }
                    />
                  ))}
                </List>
              ) : null}
            </Section>
            <Section title="Coming up">
              {q.data?.later.length ? (
                <List label="Upcoming">
                  {q.data.later.map((s) => (
                    <ListRow
                      key={s.classUid}
                      leading={<Avatar name={s.authorName} src={s.authorAvatar} size="md" decorative />}
                      title={
                        <Link to="/live/$classId" params={{ classId: s.classUid }} search={{ slug: s.classSlug, course: undefined }} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          {s.title}
                        </Link>
                      }
                      badge={<Badge tone="info">{when(s.liveAt) || "Upcoming"}</Badge>}
                      meta={
                        <>
                          <span>{s.authorName}</span>
                          {s.goalName ? (
                            <>
                              <Dot />
                              <span>{s.goalName}</span>
                            </>
                          ) : null}
                        </>
                      }
                    />
                  ))}
                </List>
              ) : (
                <EmptyState icon={Radio} title="No upcoming classes listed" body="Check a teacher's page for their batch schedule." />
              )}
            </Section>
          </>
        )}
      </PageBody>
    </AppShell>
  );
}
