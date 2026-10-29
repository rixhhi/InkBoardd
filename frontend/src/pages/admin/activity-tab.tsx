import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { Button, ErrorState, Select, Skeleton, Surface } from "@/components/ui";
import type { ActivityItem } from "@/components/admin/bits";
import { Storylines } from "@/components/admin/storylines";
import { AUDIT_LABEL, get, useMembers, type AuditItem, type Online } from "@/components/admin/api";
import { fmtAgo } from "@/lib/session";

type ActivityResponse = { windowMinutes: number; online: Online[]; items: ActivityItem[]; next: number | null };

/** The last hour of member activity (older raw events are deleted) and who is online. */
export function ActivityTab() {
  const members = useMembers();
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState("");
  const [pages, setPages] = useState<number[]>([]);
  const before = pages[pages.length - 1];
  const qs = new URLSearchParams();
  if (userId) qs.set("userId", userId);
  if (kind) qs.set("kind", kind);
  if (before) qs.set("before", String(before));
  const q = useQuery({
    queryKey: ["admin", "activity", userId, kind, before ?? 0],
    queryFn: () => get<ActivityResponse>(`/api/admin/activity?${qs}`),
    refetchInterval: before ? false : 20_000,
  });
  const reset = () => setPages([]);
  const online = q.data?.online.length ?? 0;

  return (
    <div className="grid max-w-3xl gap-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
        <Clock3 aria-hidden="true" className="size-4" />
        <span>
          Last {q.data?.windowMinutes ?? 60} minutes, one line per sitting. Older events are deleted; watch time is kept as daily totals.
        </span>
        {q.data ? (
          <span className="inline-flex items-center gap-1.5 text-fg">
            <span aria-hidden="true" className={online ? "size-2 rounded-full bg-ok" : "size-2 rounded-full bg-line"} />
            {online ? `${online} online now` : "Nobody online right now"}
          </span>
        ) : null}
      </p>
      <div className="grid content-start gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Select
            label="Member"
            value={userId}
            onChange={(v) => {
              setUserId(v);
              reset();
            }}
            options={[{ value: "", label: "Everyone" }, ...(members.data?.members ?? []).map((m) => ({ value: String(m.id), label: m.name }))]}
          />
          <Select
            label="Kind"
            value={kind}
            onChange={(v) => {
              setKind(v);
              reset();
            }}
            options={[
              { value: "", label: "All activity" },
              { value: "watch", label: "Watch time" },
              { value: "lesson", label: "Classes opened" },
              { value: "course", label: "Courses opened" },
              { value: "teacher", label: "Teachers opened" },
              { value: "exam", label: "Exams opened" },
              { value: "login", label: "Sign-ins" },
            ]}
          />
          {pages.length ? (
            <Button variant="secondary" onClick={reset}>
              Newest
            </Button>
          ) : null}
        </div>
        <Surface>{q.isLoading ? <Skeleton className="h-60" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <Storylines items={q.data?.items ?? []} />}</Surface>
        {q.data?.next ? (
          <Button variant="secondary" className="justify-self-center" onClick={() => setPages((p) => [...p, q.data!.next!])}>
            Older
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** What admins changed: members, groups, shares, settings. Kept 90 days. */
export function AuditTab() {
  const [pages, setPages] = useState<number[]>([]);
  const before = pages[pages.length - 1];
  const q = useQuery({ queryKey: ["admin", "audit", before ?? 0], queryFn: () => get<{ items: AuditItem[]; next: number | null }>(`/api/admin/audit${before ? `?before=${before}` : ""}`) });
  return (
    <div className="grid max-w-3xl gap-4">
      <p className="text-sm text-fg-muted">Every change made by an admin. Kept for 90 days.</p>
      <Surface className="p-0">
        {q.isLoading ? (
          <Skeleton className="m-4 h-60" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data?.items.length ? (
          <p className="py-8 text-center text-sm text-fg-muted">No admin changes yet.</p>
        ) : (
          <ol className="m-0 list-none divide-y divide-line p-0">
            {q.data.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-3 text-sm">
                <span className="font-medium text-fg">{a.actorName}</span>
                <span className="text-fg-muted">{AUDIT_LABEL[a.action] ?? a.action}</span>
                {a.target ? <span className="min-w-0 truncate text-fg">{a.target}</span> : null}
                {a.detail ? <span className="text-fg-muted">· {a.detail}</span> : null}
                <time dateTime={a.at} title={new Date(a.at).toLocaleString()} className="ml-auto text-xs text-fg-faint">
                  {fmtAgo(a.at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </Surface>
      <div className="flex justify-center gap-2">
        {pages.length ? (
          <Button variant="secondary" onClick={() => setPages([])}>
            Newest
          </Button>
        ) : null}
        {q.data?.next ? (
          <Button variant="secondary" onClick={() => setPages((p) => [...p, q.data!.next!])}>
            Older
          </Button>
        ) : null}
      </div>
    </div>
  );
}
