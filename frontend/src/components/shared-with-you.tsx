import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CirclePlay, Clock3, GraduationCap, Inbox, Layers, Share2, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, Button, Card, EmptyState, Section, Skeleton } from "@/components/ui";
import { DayBars, StatTile } from "@/components/admin/bits";
import { apiJson } from "@/lib/api-client";
import { SHARE_KIND_LABEL, fmtMinutes, shareHref, useAccess, useCurrentUser, type Share, type ShareKind } from "@/lib/session";

const ICON: Record<ShareKind, LucideIcon> = { exam: GraduationCap, teacher: UserRound, course: BookOpen, batch: Layers, lesson: CirclePlay };

function ShareCard({ s }: { s: Share }) {
  const Icon = ICON[s.kind];
  const href = shareHref(s);
  return (
    <Card padded={false} className="min-w-0">
      <Link
        to={href.to}
        params={href.params as never}
        search={href.search as never}
        className="flex h-full min-w-0 items-start gap-3 rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <Badge>{SHARE_KIND_LABEL[s.kind]}</Badge>
            {s.userId != null ? <Badge tone="accent">For you</Badge> : null}
          </span>
          <span className="mt-1 line-clamp-2 block font-medium text-fg">{s.label || s.ref}</span>
          {s.note ? <span className="mt-1 line-clamp-2 block text-sm text-fg-muted">{s.note}</span> : null}
        </span>
      </Link>
    </Card>
  );
}

/** The member's own numbers: watch time and active days, from the server's activity log. */
function MyWeek() {
  const q = useQuery({
    queryKey: ["me", "summary"],
    queryFn: () => apiJson<{ stats: { watchSeconds7d: number; lessons7d: number; activeDays30d: number } | null; daily: { day: string; seconds: number }[] }>("/api/me/summary", { credentials: "same-origin" }),
    staleTime: 60_000,
  });
  if (!q.data) return null;
  const s = q.data.stats;
  if (!s || (!s.watchSeconds7d && !s.activeDays30d)) return null;
  return (
    <Section title="Your week">
      <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2fr)]">
        <StatTile label="Watched" value={fmtMinutes(s.watchSeconds7d)} hint="last 7 days" icon={Clock3} />
        <StatTile label="Classes" value={s.lessons7d} hint="last 7 days" />
        <StatTile label="Active days" value={s.activeDays30d} hint="last 30 days" />
        <div className="rounded-lg bg-surface p-4 shadow-1">
          <DayBars days={q.data.daily} label="Minutes per day" />
        </div>
      </div>
    </Section>
  );
}

/**
 * Member dashboard block: everything the admin shared, newest first.
 * Admins get a short pointer to the admin dashboard instead.
 */
export function SharedWithYou() {
  const user = useCurrentUser();
  const access = useAccess();
  if (!user) return null;
  if (access.admin) {
    return (
      <Section title="You're the admin">
        <Card padded className="flex flex-wrap items-center gap-4">
          <p className="min-w-0 flex-1 text-sm text-fg-muted">Add members, share exams, teachers and courses with them, and see their watch time.</p>
          <Button icon={Share2} asChild>
            <Link to="/admin">Open the admin dashboard</Link>
          </Button>
        </Card>
      </Section>
    );
  }
  if (!access.ready) return <Skeleton className="h-28" />;
  const shares = access.shares;
  return (
    <>
      <Section title="Shared with you" description={shares.length ? `${shares.length} item${shares.length === 1 ? "" : "s"} from your admin` : undefined}>
        {shares.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shares.map((s) => (
              <ShareCard key={s.id} s={s} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Inbox}
            title={access.open ? "Nothing pinned yet" : "Nothing shared yet"}
            body={access.open ? "You can browse every exam below. Your admin can also pin things here for you." : "Your admin hasn't shared any exams, teachers or courses with you yet. They'll appear here."}
          />
        )}
      </Section>
      <MyWeek />
    </>
  );
}
