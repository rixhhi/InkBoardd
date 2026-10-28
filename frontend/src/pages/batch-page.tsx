import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Button,
  ErrorState,
  PageBody,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { Fetching } from "@/components/fetching";
import { softFailure } from "@/components/failure-notice";
import { loadBatchDetail, loadBatchSchedule, type BatchSession } from "@/lib/unacademy";
import { COPY } from "@inkboard/shared/copy";
import { describeError } from "@/lib/api-client";
import { useCatalogRoot } from "@/lib/session";

import { type ViewMode, type Range, startOfDay, startOfWeek, addDays, dayKey, byTime } from "./batch/helpers";
import { BatchBoard } from "./batch/batch-board";

export default function BatchPage() {
  const root = useCatalogRoot();
  const { batchId } = useParams({ from: "/batch/$batchId" });
  const { slug } = useSearch({ from: "/batch/$batchId" });
  const [extraPast, setExtraPast] = useState<BatchSession[]>([]);
  const [pastRank, setPastRank] = useState<number | null>(null);
  const [loadingPast, setLoadingPast] = useState(false);
  const [pastError, setPastError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [range, setRange] = useState<Range>("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [classQ, setClassQ] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const q = useQuery({
    queryKey: ["batch", "v3", batchId],
    queryFn: async ({ signal }) => {
      const page = await loadBatchDetail({ data: { uid: batchId, slug }, signal });
      setExtraPast([]);
      setPastRank(page.nextPastRank);
      setPastError(null);
      return page;
    },
  });

  const sessions = useMemo(() => {
    const first = q.data?.sessions ?? [];
    const seen = new Set(first.map((s) => s.uid));
    return [...first, ...extraPast.filter((s) => !seen.has(s.uid))];
  }, [q.data?.sessions, extraPast]);

  const authors = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of q.data?.batch.authors ?? []) {
      if (a.username) map.set(a.username, a.name);
    }
    for (const s of sessions) {
      if (s.authorUsername && !map.has(s.authorUsername)) map.set(s.authorUsername, s.authorName);
    }
    return [...map.entries()].map(([username, name]) => ({ username, name }));
  }, [q.data?.batch.authors, sessions]);

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    const week0 = startOfWeek(new Date());
    const week1 = addDays(week0, 7);
    return sessions.filter((s) => {
      if (teacherFilter !== "all" && s.authorUsername !== teacherFilter) return false;
      if (classQ.trim() && !s.title.toLowerCase().includes(classQ.trim().toLowerCase())) return false;
      if (range === "all") return true;
      if (!s.liveAt) return range !== "today";
      const t = new Date(s.liveAt).getTime();
      if (range === "today") return t >= today.getTime() && t < addDays(today, 1).getTime();
      return t >= week0.getTime() && t < week1.getTime();
    });
  }, [sessions, teacherFilter, range, classQ]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      const key = day.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const list = filtered
        .filter((s) => dayKey(s.liveAt) === key)
        .sort((a, b) => byTime(a, b, 1));
      return { day, key, list };
    });
  }, [weekStart, filtered]);


  if (q.isLoading) {
    return (
      <AppShell>
        <PageHeader eyebrow={<Skeleton className="h-3 w-24" />} title={<Skeleton className="h-8 w-80" />} subline={<Skeleton className="h-4 w-56" />} />
        <PageBody className="grid gap-2">
          <Fetching label="Fetching this batch" compact />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </PageBody>
      </AppShell>
    );
  }

  if (q.isError || !q.data) {
    const soft = softFailure(q.error);
    const described = describeError(q.error);
    return (
      <AppShell>
        <PageBody className="pt-8">
          <ErrorState
            error={q.error}
            heading
            title={soft?.title ?? (described.title || COPY.shelfDidNotLoad)}
            body={soft?.body ?? described.body}
            onRetry={() => void q.refetch()}
            retryAfterSec={described.kind === "ratelimit" ? 8 : undefined}
            action={
              <Button variant="ghost" asChild>
                <Link to={root.to}>{root.back}</Link>
              </Button>
            }
          />
        </PageBody>
      </AppShell>
    );
  }

  const { batch } = q.data;
  const live = filtered.filter((s) => s.status === "live");
  const upcoming = filtered.filter((s) => s.status === "upcoming").sort((a, b) => byTime(a, b, 1));
  const past = filtered.filter((s) => s.status !== "live" && s.status !== "upcoming").sort((a, b) => byTime(a, b, -1));
  const teacher = batch.authors[0]?.username;
  const weekLabel = `${weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${addDays(weekStart, 6).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
  const isThisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();

  async function loadOlder() {
    if (pastRank == null || loadingPast) return;
    setLoadingPast(true);
    setPastError(null);
    try {
      const page = await loadBatchSchedule({
        data: { uid: batchId, past: true, rank: pastRank },
      });
      setExtraPast((prev) => {
        const have = new Set([...sessions, ...prev].map((s) => s.uid));
        return [...prev, ...page.sessions.filter((s) => !have.has(s.uid))];
      });
      setPastRank(page.nextRank);
      if (page.sessions.length === 0 && page.nextRank == null) setPastRank(null);
    } catch (err) {
      setPastError(err instanceof Error ? err.message : "Older classes did not load.");
    } finally {
      setLoadingPast(false);
    }
  }

  return (
    <BatchBoard
      batchId={batchId}
      batch={batch}
      teacher={teacher}
      live={live}
      upcoming={upcoming}
      past={past}
      filtered={filtered}
      view={view}
      setView={setView}
      range={range}
      setRange={setRange}
      setWeekStart={setWeekStart}
      weekStart={weekStart}
      weekLabel={weekLabel}
      isThisWeek={isThisWeek}
      weekDays={weekDays}
      authors={authors}
      teacherFilter={teacherFilter}
      setTeacherFilter={setTeacherFilter}
      classQ={classQ}
      setClassQ={setClassQ}
      pastRank={pastRank}
      loadingPast={loadingPast}
      pastError={pastError}
      loadOlder={loadOlder}
      sessionsCount={sessions.length}
    />
  );
}
