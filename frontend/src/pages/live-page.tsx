import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { useQuery } from "@tanstack/react-query";

import { useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";

import { ArrowLeft } from "lucide-react";
import { Avatar, Badge, Button, Card, ErrorState, PageBody, PageHeader, Skeleton } from "@/components/ui";
import { Fetching } from "@/components/fetching";
import { softFailure } from "@/components/failure-notice";

import { LiveStage } from "@/components/live-stage";

import { WidgetErrorBoundary } from "@/lib/error-component";

import { COPY } from "@inkboard/shared/copy";
import { describeError } from "@/lib/api-client";

import { canJoinLive, emptyLiveSession, holdJoinableSession } from "@inkboard/shared/live-session";

import { loadClassDetail, loadLiveSession } from "@/lib/unacademy";
import { useCatalogRoot } from "@/lib/session";

function fmtWhen(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = t - now;
  if (diff <= 0) return "starting now";
  const s = Math.floor(diff / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function LivePage() {
  const root = useCatalogRoot();
  const { classId } = useParams({ from: "/live/$classId" });
  const search = useSearch({ from: "/live/$classId" });
  const nav = useNavigate();

  const q = useQuery({
    queryKey: ["live-class", classId, search.slug ?? ""],
    queryFn: ({ signal }) => loadClassDetail({ data: { uid: classId, slug: search.slug }, signal }),
    placeholderData: (prev) => prev,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return 10_000;
      if (d.replayId) return false;
      if (d.status === "live") return 12_000;
      return 20_000;
    },
  });

  const live = q.data?.status === "live";
  const tokenQ = useQuery({
    queryKey: ["live-token", classId],
    queryFn: ({ signal }) => loadLiveSession({ data: { uid: classId, slug: search.slug }, signal }),
    enabled: Boolean(classId) && !q.data?.replayId,
    placeholderData: (prev) => prev,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return 12_000;
      if (d.gated) return false;
      if (canJoinLive(d) || d.hlsUrl) return 240_000;
      return 12_000;
    },
  });

  const heldSession = useRef<{ id: string; session?: typeof tokenQ.data }>({ id: classId });
  if (heldSession.current.id !== classId) heldSession.current = { id: classId, session: tokenQ.data };
  heldSession.current.session = holdJoinableSession(heldSession.current.session, tokenQ.data);

  const left = useCountdown(q.data?.status === "upcoming" ? q.data.liveAt : null);

  useEffect(() => {
    if (!q.data?.replayId) return;
    void nav({
      to: "/play/$lessonId",
      params: { lessonId: q.data.replayId },
      search: {
        title: q.data.title,
        teacher: q.data.authorUsername,
        course: q.data.courseUid || search.course,
      },
    });
  }, [q.data?.replayId, q.data?.title, q.data?.authorUsername, q.data?.courseUid, nav, search.course]);

  if (q.isLoading) {
    return (
      <AppShell compact>
        <PageHeader compact eyebrow={<Skeleton className="h-3 w-16" />} title={<Skeleton className="h-7 w-72" />} subline={<Skeleton className="h-4 w-48" />} />
        <PageBody>
          <Fetching label="Opening this class" compact />
          <Skeleton className="mt-4 aspect-video w-full rounded-lg" />
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
            title={soft?.title ?? (described.title || COPY.doorDidNotOpen)}
            body={soft?.body ?? described.body}
            onRetry={() => void q.refetch()}
            retryAfterSec={described.kind === "ratelimit" ? 8 : undefined}
            action={
              <Button variant="ghost" asChild>
                <Link to="/live">{COPY.backToTheWall}</Link>
              </Button>
            }
          />
        </PageBody>
      </AppShell>
    );
  }

  const c = q.data;
  const upcoming = c.status === "upcoming";
  const backTo = search.course
    ? `/course/${search.course}`
    : c.authorUsername
      ? `/teacher/${c.authorUsername}`
      : "/";
  const backLabel = search.course ? "← Course" : c.authorName ? `← ${c.authorName}` : "← Wall";
  const session = heldSession.current.session;
  const hls = session?.hlsUrl || c.hlsUrls[0] || null;
  const join = session && canJoinLive(session);
  const onAir = live || Boolean(join);
  if (onAir && (join || hls)) {
    return (
      <WidgetErrorBoundary title={COPY.slateSlipped}>
      <LiveStage
        session={
          session && join
            ? session
            : emptyLiveSession(classId, {
                display: c.authorName,
                hlsUrl: hls,
                className: c.title,
                courseName: c.courseName,
                educatorName: c.authorName,
              })
        }
        title={c.title}
        educator={session?.display || c.authorName}
        backTo={backTo}
      />
      </WidgetErrorBoundary>
    );
  }

  const plusWait = Boolean(session?.gated && live);
  const waitTitle = onAir
    ? plusWait
      ? COPY.plusDoor
      : COPY.liveAtDoor
    : upcoming
      ? `Starts in ${left}`
      : COPY.boardIsComing;
  const waitBody = onAir
    ? plusWait
      ? COPY.plusDoor
      : "The live picture is joining. Keep this door open — if the stream does not land, Inkboard opens the synced board when the recording does."
    : upcoming
      ? "This slot has not started yet. Leave this door open — when the class goes live we watch for the picture, then the recording."
      : "The live slot has ended. Waiting for the recording and slides — this door opens the board when they land.";

  return (
    <AppShell compact>
      <PageHeader
        compact
        leading={
          <Button variant="ghost" size="sm" icon={ArrowLeft} asChild className="-ml-2">
            <Link to={backTo}>{backLabel.replace(/^←\s*/, "")}</Link>
          </Button>
        }
        eyebrow={onAir ? <Badge tone="live">Live</Badge> : <Badge tone={upcoming ? "info" : "neutral"}>{upcoming ? "Upcoming" : "Door"}</Badge>}
        title={c.title}
        subline={
          <>
            {c.authorName || c.authorUsername}
            {c.liveAt ? ` · ${fmtWhen(c.liveAt)} IST` : ""}
          </>
        }
      />
      <PageBody>
        <Card role="status" aria-live="polite" className="max-w-2xl">
          <div className="flex items-start gap-4">
            <Avatar src={c.authorAvatar} name={c.authorName || c.title} size="xl" decorative />
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-xl text-fg">{waitTitle}</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {c.authorName || "Educator"}
                {c.authorUsername ? <span className="text-fg-faint"> · @{c.authorUsername}</span> : null}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">{waitBody}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {onAir ? <Fetching label="Joining the live picture" compact /> : null}
                {c.courseName ? (
                  <Button variant="ghost" size="sm" asChild>
                    {c.courseUid ? (
                      <Link to="/course/$courseId" params={{ courseId: c.courseUid }}>
                        {c.courseName}
                      </Link>
                    ) : (
                      <Link to={root.to}>{c.courseName}</Link>
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      </PageBody>
    </AppShell>
  );
}
