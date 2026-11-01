/**
 * The bell. Polls /api/me/notifications every minute (and when the tab comes
 * back), shows an unread dot, opens a Sheet with the list. Opening the sheet
 * marks what is on screen as read; a row with a link navigates and closes.
 *
 * Nothing here is pushed from the server — no email, no web push. Members
 * who open the site see what changed since last time; that is the contract.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff, CheckCheck, KeyRound, Share2, Sparkles, UserPlus, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { apiJson } from "@/lib/api-client";
import { sendJson, useCurrentUser } from "@/lib/session";
import { Button, EmptyState, IconButton, Sheet, Skeleton } from "@/components/ui";

export type NotificationKind = "share.new" | "password.reset" | "member.welcome" | "reset.requested" | "member.joined" | "info";

export type Notification = {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  readAt: string | null;
};

type Feed = { unread: number; items: Notification[] };

export const NOTIFICATIONS_KEY = ["me", "notifications"] as const;
const POLL_MS = 60_000;

const ICON: Record<NotificationKind, typeof Bell> = {
  "share.new": Share2,
  "password.reset": KeyRound,
  "member.welcome": Sparkles,
  "reset.requested": KeyRound,
  "member.joined": UserPlus,
  info: Bell,
};

/** "just now", "4 min", "2 h", "3 d", else a short date. */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function useNotifications(enabled = true) {
  return useQuery<Feed>({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: ({ signal }) => apiJson<Feed>("/api/me/notifications", { credentials: "same-origin", cache: "no-store", signal }),
    enabled,
    staleTime: 20_000,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

function Row({ n, onOpen, onDismiss }: { n: Notification; onOpen: (n: Notification) => void; onDismiss: (id: number) => void }) {
  const Icon = ICON[n.kind] ?? Bell;
  const unread = !n.readAt;
  const inner: ReactNode = (
    <>
      <span aria-hidden="true" className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-md", unread ? "bg-accent-subtle text-accent" : "bg-surface-raised text-fg-muted")}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-sm", unread ? "font-semibold text-fg" : "font-medium text-fg")}>{n.title}</span>
          <time dateTime={n.createdAt} className="shrink-0 text-xs text-fg-faint tabular-nums">
            {ago(n.createdAt)}
          </time>
        </span>
        {n.body ? <span className="mt-0.5 block text-sm leading-snug text-fg-muted">{n.body}</span> : null}
        {unread ? <span className="sr-only"> (unread)</span> : null}
      </span>
    </>
  );
  return (
    <li className="group relative flex gap-3 border-b border-line py-3 last:border-b-0">
      {n.href ? (
        <button
          type="button"
          onClick={() => onOpen(n)}
          className="flex min-w-0 flex-1 gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {inner}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 gap-3">{inner}</div>
      )}
      <IconButton
        label={`Dismiss: ${n.title}`}
        icon={X}
        size="sm"
        onClick={() => onDismiss(n.id)}
        className="shrink-0 self-start text-fg-faint opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
      />
    </li>
  );
}

export function NotificationsBell({ className }: { className?: string }) {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const q = useNotifications(Boolean(user));
  const unread = q.data?.unread ?? 0;
  const items = q.data?.items ?? [];

  // Opening the panel marks what you can see as read (after a beat, so the bold rows are seen first).
  useEffect(() => {
    if (!open || !unread) return;
    const ids = items.filter((n) => !n.readAt).map((n) => n.id);
    if (!ids.length) return;
    const t = window.setTimeout(() => {
      void sendJson<{ unread: number }>("/api/me/notifications/read", "POST", { ids })
        .then((res) => {
          qc.setQueryData<Feed>(NOTIFICATIONS_KEY, (cur) =>
            cur ? { unread: res.unread, items: cur.items.map((n) => (ids.includes(n.id) ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)) } : cur,
          );
        })
        .catch(() => {});
    }, 1200);
    return () => window.clearTimeout(t);
  }, [open, unread, items, qc]);

  if (!user) return null;

  const openRow = (n: Notification) => {
    setOpen(false);
    if (n.href) void nav({ to: n.href as never });
  };
  const dismiss = (id: number) => {
    qc.setQueryData<Feed>(NOTIFICATIONS_KEY, (cur) => {
      if (!cur) return cur;
      const gone = cur.items.find((n) => n.id === id);
      return { unread: gone && !gone.readAt ? Math.max(0, cur.unread - 1) : cur.unread, items: cur.items.filter((n) => n.id !== id) };
    });
    void sendJson(`/api/me/notifications/${id}`, "DELETE").catch(() => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }));
  };
  const readAll = () => {
    void sendJson<{ unread: number }>("/api/me/notifications/read", "POST", {})
      .then(() => qc.setQueryData<Feed>(NOTIFICATIONS_KEY, (cur) => (cur ? { unread: 0, items: cur.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) } : cur)))
      .catch(() => {});
  };

  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <>
      <span className={cn("relative inline-flex", className)}>
        <IconButton label={label} icon={Bell} onClick={() => setOpen(true)} pressed={open} />
        {unread ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-fg tabular-nums ring-2 ring-bg"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </span>
      <Sheet open={open} onOpenChange={setOpen} title="Notifications" width="w-[24rem]">
        <div className="flex items-center justify-between gap-2 py-2">
          <p className="text-xs text-fg-muted">{unread ? `${unread} unread` : items.length ? "All caught up" : ""}</p>
          {unread ? (
            <Button variant="ghost" size="sm" icon={CheckCheck} onClick={readAll}>
              Mark all read
            </Button>
          ) : null}
        </div>
        {q.isLoading ? (
          <div className="grid gap-3 py-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : q.isError ? (
          <EmptyState icon={BellOff} title="Couldn't load notifications" body="Try again in a moment." action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Try again</Button>} />
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="Nothing yet" body="You'll hear here when your admin shares something with you or changes your account." />
        ) : (
          <ul aria-label="Notifications" className="-mt-1">
            {items.map((n) => (
              <Row key={n.id} n={n} onOpen={openRow} onDismiss={dismiss} />
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
