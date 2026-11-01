import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock3, GraduationCap, Play, Radio, Search } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Avatar, Badge, Button, Card, Dot, Kbd, List, ListRow, PageBody, PageHeader, Progress, Section, Skeleton } from "@/components/ui";
import { chromeLabel } from "@inkboard/shared/i18n";
import { COPY } from "@inkboard/shared/copy";
import { useChromeLocale } from "@/lib/use-locale";
import { useSelectedExam } from "@inkboard/shared/exam-pref";
import { readLater, type LaterItem } from "@inkboard/shared/library";
import { readHistory, subscribeHistory, type WatchEntry } from "@inkboard/shared/watch-history";
import { loadLiveFeed } from "@/lib/unacademy";
import { SharedWithYou } from "@/components/shared-with-you";
import { FirstRun } from "@/components/first-run";
import { useAccess } from "@/lib/session";

const HomeExams = lazy(() => import("@/components/home-exams").then((m) => ({ default: m.HomeExams })));

/** Browser-only store readers: render a skeleton on the server, the real list after mount. */
function useClientList<T>(read: () => T[], subscribe?: (fn: () => void) => () => void) {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    setReady(true);
    return subscribe ? subscribe(sync) : undefined;
  }, [read, subscribe]);
  return { ready, items };
}

function minutesLeft(e: WatchEntry) {
  if (e.duration <= 0) return null;
  const left = Math.max(0, e.duration - e.t);
  return Math.round(left / 60);
}

function pctOf(e: WatchEntry) {
  return e.duration > 0 ? Math.min(100, Math.round((e.t / e.duration) * 100)) : 0;
}

/** "23:14" for a resume point; null when the class was barely started or is finished. */
function resumeClock(e: WatchEntry): string | null {
  if (e.t < 30 || (e.duration > 0 && e.t >= e.duration - 30)) return null;
  const m = Math.floor(e.t / 60);
  const s = Math.floor(e.t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ---------------- Continue ---------------- */

function ContinueCard({ entry, primary }: { entry: WatchEntry; primary?: boolean }) {
  const left = minutesLeft(entry);
  const pct = pctOf(entry);
  const at = resumeClock(entry);
  return (
    <Card padded={false} className="relative">
      <Link
        to="/play/$lessonId"
        params={{ lessonId: entry.lessonId }}
        // Pass the saved position so "Continue" really continues (the player honours ?t as startAt).
        search={{ title: entry.title, teacher: entry.teacher, course: entry.course, t: at ? Math.floor(entry.t) : undefined }}
        // No aria-label: the card's visible text (eyebrow, title, "Resume at", "min left") IS the name,
        // so screen readers and sighted users hear/see the same thing.
        className="block rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">{primary ? COPY.onTheBoard : entry.examName || "Recent"}</p>
            <p className={primary ? "mt-1 line-clamp-2 font-serif text-xl text-fg" : "mt-1 line-clamp-2 font-medium text-fg"}>{entry.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
              {entry.teacher ? <span>{entry.teacher}</span> : null}
              {entry.teacher && (at || left != null) ? <Dot /> : null}
              {at ? <span className="text-fg tabular-nums">Resume at {at}</span> : null}
              {at && left != null ? <Dot /> : null}
              {left != null ? <span>{left ? `${left} min left` : "Finished"}</span> : null}
            </p>
          </div>
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-bg">
            <Play className="ml-0.5 size-4" />
          </span>
        </div>
        <div className="mt-3">
          <Progress value={pct} label={`${pct}% watched`} />
        </div>
      </Link>
    </Card>
  );
}

function ContinueShelf() {
  const { ready, items } = useClientList<WatchEntry>(readHistory, subscribeHistory);
  if (!ready) {
    return (
      <Section title={COPY.onTheBoard}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="hidden h-36 sm:block" />
          <Skeleton className="hidden h-36 sm:block" />
        </div>
      </Section>
    );
  }
  const first = items[0];
  if (!first) return null;
  const rest = items.slice(1, 3);
  return (
    <Section
      title={COPY.onTheBoard}
      action={
        <Button variant="ghost" size="sm" iconEnd={ArrowRight} asChild>
          <Link to="/library" search={{ tab: "history" }}>
            History
          </Link>
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={rest.length ? "sm:col-span-1" : "sm:col-span-3"}>
          <ContinueCard entry={first} primary />
        </div>
        {rest.map((e) => (
          <ContinueCard key={e.lessonId} entry={e} />
        ))}
      </div>
    </Section>
  );
}

/* ---------------- Live now ---------------- */

function LiveNow() {
  const q = useQuery({ queryKey: ["live-feed"], queryFn: ({ signal }) => loadLiveFeed(signal), refetchInterval: 60_000, staleTime: 30_000 });
  const live = q.data?.live ?? [];
  if (q.isError || (!q.isLoading && !live.length)) return null;
  return (
    <Section
      title={COPY.liveAtDoor}
      action={
        <Button variant="ghost" size="sm" iconEnd={ArrowRight} asChild>
          <Link to="/live">All live</Link>
        </Button>
      }
    >
      {q.isLoading ? (
        <div className="grid gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : (
        <List label={COPY.liveAtDoor}>
          {live.slice(0, 4).map((s) => (
            <ListRow
              key={s.classUid}
              leading={<Avatar name={s.authorName} src={s.authorAvatar} size="md" decorative />}
              title={
                <Link
                  to="/live/$classId"
                  params={{ classId: s.classUid }}
                  search={{ slug: s.classSlug, course: undefined }}
                  className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
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
                </>
              }
            />
          ))}
        </List>
      )}
    </Section>
  );
}

/* ---------------- Watch later ---------------- */

function WatchLaterShelf() {
  const { ready, items } = useClientList<LaterItem>(readLater);
  if (!ready || !items.length) return null;
  return (
    <Section
      title="Watch later"
      action={
        <Button variant="ghost" size="sm" iconEnd={ArrowRight} asChild>
          <Link to="/library" search={{ tab: "later" }}>
            All saved
          </Link>
        </Button>
      }
    >
      <List label="Watch later">
        {items.slice(0, 4).map((item) => (
          <ListRow
            key={item.lessonId}
            density="compact"
            leading={<Clock3 aria-hidden="true" className="size-4 text-fg-faint" />}
            title={
              <Link
                to="/play/$lessonId"
                params={{ lessonId: item.lessonId }}
                search={{ title: item.title, teacher: item.teacher, course: item.course }}
                className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {item.title}
              </Link>
            }
            meta={item.teacher ? <span>{item.teacher}</span> : undefined}
          />
        ))}
      </List>
    </Section>
  );
}

/* ---------------- Your exam ---------------- */

function YourExam() {
  const exam = useSelectedExam();
  const access = useAccess();
  if (!exam || (access.exams && !access.exams.has(exam.id))) return null;
  return (
    <Section title="Your exam">
      <Card padded={false}>
        <Link
          to="/exam/$goalId"
          params={{ goalId: exam.id }}
          className="flex items-center gap-4 rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5"
        >
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
            <GraduationCap className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold tracking-[0.14em] text-accent uppercase">{exam.group}</span>
            <span className="mt-0.5 block font-serif text-xl text-fg">{exam.name}</span>
            <span className="mt-0.5 block truncate text-sm text-fg-muted">{exam.blurb}</span>
          </span>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-fg-faint" />
        </Link>
      </Card>
    </Section>
  );
}

/* ---------------- Page ---------------- */

export default function Home() {
  const { locale } = useChromeLocale();
  const access = useAccess();
  const name = access.user?.name?.split(" ")[0];
  return (
    <AppShell>
      <PageHeader
        eyebrow="Inkboard"
        title={name ? `Hi, ${name}` : chromeLabel(locale, "pickExam", "Pick an exam")}
        subline={access.admin ? "Your study desk and your members' shelf." : chromeLabel(locale, "continueLine", "Continue a class, or open something shared with you.")}
        actions={
          access.perms.search ? (
            <Button variant="secondary" icon={Search} asChild className="hidden sm:inline-flex">
              <Link to="/search" search={{ q: "" }}>
                {chromeLabel(locale, "searchWhere", COPY.writeWhere)}
                <Kbd className="ml-2 hidden sm:inline-flex">Ctrl K</Kbd>
              </Link>
            </Button>
          ) : undefined
        }
      />
      <PageBody className="pb-20">
        <FirstRun />
        <ContinueShelf />
        <SharedWithYou />
        {access.perms.live ? <LiveNow /> : null}
        <WatchLaterShelf />
        <YourExam />
        <Section
          title={access.exams ? "Your exams" : "All exams"}
          action={
            access.perms.browse ? (
              <Button variant="ghost" size="sm" icon={Radio} asChild>
                <Link to="/browse">Browse</Link>
              </Button>
            ) : undefined
          }
        >
          <Suspense fallback={<Skeleton className="h-40" />}>
            <HomeExams />
          </Suspense>
        </Section>
      </PageBody>
    </AppShell>
  );
}
