import { Link, } from "@tanstack/react-router";
import {
  Badge,
  Dot,
  ListRow,
  Ring,
} from "@/components/ui";
import { LaterButton } from "@/components/watch-later";
import { cn } from "@/lib/cn";
import type { BatchSession } from "@/lib/unacademy";

import { fmtWhen, fmtTime, } from "./helpers";

export function SessionRow({
  s,
  teacher,
  n,
  struck,
  next,
  pct,
}: {
  s: BatchSession;
  teacher?: string;
  n: number;
  struck?: boolean;
  next?: boolean;
  pct: number;
}) {
  const live = s.status === "live";
  const upcoming = s.status === "upcoming";
  const playable = Boolean(s.replayId);
  const title = playable ? (
    <Link
      to="/play/$lessonId"
      params={{ lessonId: s.replayId! }}
      search={{ title: s.title, teacher: s.authorUsername || teacher, course: s.courseUid }}
      className="hover:underline after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
    >
      {s.title}
    </Link>
  ) : (
    s.title
  );
  return (
    <ListRow
      current={next}
      struck={!playable && !live && !upcoming}
      leading={
        playable && pct > 0 ? (
          <Ring value={struck ? 100 : pct} label={`${pct}% watched`} />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised font-mono text-xs text-fg-muted tabular-nums">{s.rank || n}</span>
        )
      }
      title={title}
      badge={live ? <Badge tone="live">Live</Badge> : upcoming ? <Badge tone="info">Upcoming</Badge> : struck ? <Badge tone="ok">Done</Badge> : next ? <Badge tone="accent">Next</Badge> : null}
      meta={
        <>
          <span>{s.authorName}</span>
          {s.liveAt ? (
            <>
              <Dot />
              <span>{fmtWhen(s.liveAt)}</span>
            </>
          ) : null}
          {!playable && !live && !upcoming ? (
            <>
              <Dot />
              <span>No replay</span>
            </>
          ) : null}
        </>
      }
      trailing={playable ? <LaterButton lessonId={s.replayId} title={s.title} teacher={s.authorUsername || teacher} course={s.courseUid} /> : undefined}
    />
  );
}

export function WeekCard({ s, teacher }: { s: BatchSession; teacher?: string }) {
  const live = s.status === "live";
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tabular-nums text-fg-muted">{fmtTime(s.liveAt) || "—"}</span>
        {live ? <Badge tone="live">Live</Badge> : null}
      </span>
      <span className="mt-1 line-clamp-2 block text-sm text-fg">{s.title}</span>
      <span className="mt-0.5 block truncate text-xs text-fg-faint">{s.authorName}</span>
    </>
  );
  const cls = "block rounded-md px-2 py-1.5 transition-colors duration-[var(--dur-fast)]";
  if (s.replayId) {
    return (
      <Link
        to="/play/$lessonId"
        params={{ lessonId: s.replayId }}
        search={{ title: s.title, teacher: s.authorUsername || teacher, course: s.courseUid }}
        className={cn(cls, "hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}
      >
        {body}
      </Link>
    );
  }
  return <div className={cn(cls, "opacity-70")}>{body}</div>;
}
